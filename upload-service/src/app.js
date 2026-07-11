import express from "express";
import multer from "multer";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";

import { s3 } from "./infra/s3.js";
import { sqs } from "./infra/sqs.js";
import { pool } from "./infra/db.js";
import { config } from "./config.js";
import { authMiddleware } from "./middleware/auth.js";

const app = express();

const allowedOrigins = [
  "http://localhost:8080",
  "http://127.0.0.1:8080"
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("Origin não permitida pelo CORS")
      );
    },
    methods: [
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "OPTIONS"
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization"
    ],
    credentials: true
  })
);

const upload = multer();

app.post("/videos", authMiddleware, upload.single("file"), async (req, res) => {
  const client = await pool.connect();

  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "Arquivo não enviado" });
    }

    const userId = req.user.sub;// temporário
    const videoId = uuidv4();
    const jobId = uuidv4();
    const eventId = uuidv4();
    const key = `${videoId}-${file.originalname}`;
    const s3Path = `raw-videos/${key}`;

    // 1. Upload no S3
    await s3.send(
      new PutObjectCommand({
        Bucket: config.rawBucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || "application/octet-stream",
      })
    );

    // 2. Persistência no banco
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO videos (id, user_id, file_name, s3_path, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [videoId, userId, file.originalname, s3Path, "RECEIVED"]
    );

    await client.query(
      `INSERT INTO jobs (id, video_id, type, status, attempts)
       VALUES ($1, $2, $3, $4, $5)`,
      [jobId, videoId, "PROCESSING", "PENDING", 0]
    );

    const eventPayload = {
      event_id: eventId,
      event_type: "VIDEO_UPLOADED",
      source: "upload-service",
      payload: {
        video_id: videoId,
        user_id: userId,
        s3_path: s3Path,
      },
      created_at: new Date().toISOString(),
    };

    await client.query(
      `INSERT INTO events (id, event_type, source, payload)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        eventId,
        "VIDEO_UPLOADED",
        "upload-service",
        JSON.stringify(eventPayload.payload),
      ]
    );

    await client.query("COMMIT");

    // 3. Publicação no SQS
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: config.queueUrl,
        MessageBody: JSON.stringify(eventPayload),
      })
    );

    return res.status(201).json({
      message: "Upload processado com sucesso",
      video_id: videoId,
      job_id: jobId,
      file_key: key,
      queue: config.queueName,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Erro no rollback:", rollbackError);
    }

    console.error("Erro no upload-service:", error);
    return res.status(500).json({
      error: "Erro no processamento do upload",
      details: error.message,
    });
  } finally {
    client.release();
  }
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    return res.json({
      status: "ok",
      service: "upload-service",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      details: error.message
    });
  }
});

app.listen(3000, () => {
  console.log("Upload service rodando na porta 3000");
});
app.get("/videos", authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.sub;

    const result = await client.query(
      `
      SELECT
        v.id AS video_id,
        v.file_name,
        v.status,
        v.created_at,
        v.updated_at,
        img.s3_path AS images_path,
        zip.s3_path AS zip_path
      FROM videos v
      LEFT JOIN outputs img
        ON img.video_id = v.id AND img.type = 'IMAGES'
      LEFT JOIN outputs zip
        ON zip.video_id = v.id AND zip.type = 'ZIP'
      WHERE v.user_id = $1::uuid
      ORDER BY v.created_at DESC
      `,
      [userId]
    );

    return res.status(200).json({
      items: result.rows,
      total: result.rowCount,
    });

  } catch (error) {
    console.error("Erro no GET /videos:", error);

    return res.status(500).json({
      error: "Erro ao listar vídeos do usuário",
      details: error.message,
    });

  } finally {
    client.release();
  }
});
