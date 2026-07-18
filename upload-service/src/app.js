import express from "express";
import multer from "multer";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";

import { s3 } from "./infra/s3.js";
import { sqs } from "./infra/sqs.js";
import { pool } from "./infra/db.js";
import { config } from "./config.js";
import { authMiddleware } from "./middleware/auth.js";

import {
  PutObjectCommand,
  GetObjectCommand
} from "@aws-sdk/client-s3";


const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});


app.post(
  "/videos",
  authMiddleware,
  upload.array("files", 5),
  async (req, res) => {

    const client = await pool.connect();

    try {

      const files = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({
          error: "Nenhum arquivo enviado"
        });
      }

      const allowedMimeTypes = [
        "video/mp4",
        "video/quicktime"
      ];

      const userId = req.user.sub;

      const uploadedVideos = [];

      await client.query("BEGIN");

      for (const file of files) {

        if (
          !allowedMimeTypes.includes(
            file.mimetype
          )
        ) {

          await client.query("ROLLBACK");

          return res.status(400).json({
            error:
              `Arquivo ${file.originalname} não é MP4 ou MOV`
          });

        }

        const videoId = uuidv4();
        const jobId = uuidv4();
        const eventId = uuidv4();

        const key =
          `${videoId}-${file.originalname}`;

        const s3Path =
          `raw-videos/${key}`;

        // Upload S3
        await s3.send(
          new PutObjectCommand({
            Bucket: config.rawBucket,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
          })
        );

        // Vídeo
        await client.query(
          `
          INSERT INTO videos
          (
            id,
            user_id,
            file_name,
            s3_path,
            status
          )
          VALUES
          ($1,$2,$3,$4,$5)
          `,
          [
            videoId,
            userId,
            file.originalname,
            s3Path,
            "RECEIVED"
          ]
        );

        // Job
        await client.query(
          `
          INSERT INTO jobs
          (
            id,
            video_id,
            type,
            status,
            attempts
          )
          VALUES
          ($1,$2,$3,$4,$5)
          `,
          [
            jobId,
            videoId,
            "PROCESSING",
            "PENDING",
            0
          ]
        );

        const eventPayload = {
          event_id: eventId,
          event_type: "VIDEO_UPLOADED",
          source: "upload-service",
          payload: {
            video_id: videoId,
            user_id: userId,
            user_email: req.user.email,
            s3_path: s3Path,
          },
          created_at:
            new Date().toISOString(),
        };

        // Evento
        await client.query(
          `
          INSERT INTO events
          (
            id,
            event_type,
            source,
            payload
          )
          VALUES
          ($1,$2,$3,$4::jsonb)
          `,
          [
            eventId,
            "VIDEO_UPLOADED",
            "upload-service",
            JSON.stringify(
              eventPayload.payload
            )
          ]
        );

        // Fila processamento
        await sqs.send(
          new SendMessageCommand({
            QueueUrl: config.queueUrl,
            MessageBody:
              JSON.stringify(eventPayload),
          })
        );

        // Fila notificação
        await sqs.send(
          new SendMessageCommand({
            QueueUrl:
              config.notificationQueueUrl,

            MessageBody:
              JSON.stringify({
                event_type:
                  "VIDEO_RECEIVED",

                payload: {
                  video_id: videoId,
                  user_email:
                    req.user.email
                }
              })
          })
        );

        uploadedVideos.push({
          video_id: videoId,
          job_id: jobId,
          file_name:
            file.originalname
        });

      }

      await client.query("COMMIT");

      return res.status(201).json({
        message:
          "Uploads processados com sucesso",

        total:
          uploadedVideos.length,

        items:
          uploadedVideos
      });

    } catch (error) {

      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Erro rollback:",
          rollbackError
        );
      }

      console.error(
        "Erro no upload-service:",
        error
      );

      return res.status(500).json({
        error:
          "Erro no processamento do upload",
        details:
          error.message,
      });

    } finally {

      client.release();

    }

  }
);

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

app.get(
  "/videos/:videoId/download",
  authMiddleware,
  async (req, res) => {

    const client = await pool.connect();

    try {

      const { videoId } = req.params;

      const result = await client.query(
        `
        SELECT
          file_name,
          s3_path
        FROM videos
        WHERE id = $1
        LIMIT 1
        `,
        [videoId]
      );

      if (result.rowCount === 0) {
        return res
          .status(404)
          .json({
            error: "Vídeo não encontrado"
          });
      }

      const video = result.rows[0];

      const key =
        video.s3_path.replace(
          `${config.rawBucket}/`,
          ""
        );

      const response = await s3.send(
        new GetObjectCommand({
          Bucket: config.rawBucket,
          Key: key
        })
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${video.file_name}"`
      );

      res.setHeader(
        "Content-Type",
        response.ContentType ||
        "application/octet-stream"
      );

      response.Body.pipe(res);

    } catch (error) {

      console.error(
        "Erro download vídeo:",
        error
      );

      return res
        .status(500)
        .json({
          error: "Erro ao baixar vídeo"
        });

    } finally {

      client.release();

    }
  }
);

app.get(
  "/videos/:videoId/download-zip",
  authMiddleware,
  async (req, res) => {

    const client = await pool.connect();

    try {

      const { videoId } = req.params;

      const result = await client.query(
        `
        SELECT
          o.s3_path
        FROM outputs o
        WHERE o.video_id = $1
          AND o.type = 'ZIP'
        LIMIT 1
        `,
        [videoId]
      );

      if (result.rowCount === 0) {

        return res.status(404).json({
          error: "ZIP não encontrado"
        });

      }

      const zipPath =
        result.rows[0].s3_path;

      const key =
        zipPath.replace(
          "zip-files/",
          ""
        );

      const response =
        await s3.send(
          new GetObjectCommand({
            Bucket: "zip-files",
            Key: key
          })
        );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${key}"`
      );

      res.setHeader(
        "Content-Type",
        "application/zip"
      );

      response.Body.pipe(res);

    } catch (error) {

      console.error(
        "Erro download zip:",
        error
      );

      return res.status(500).json({
        error: "Erro ao baixar ZIP"
      });

    } finally {

      client.release();

    }

  }
);