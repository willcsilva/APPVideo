import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import {
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";
import archiver from "archiver";
import { createWriteStream } from "fs";

import { sqs } from "./infra/sqs.js";
import { s3 } from "./infra/s3.js";
import { pool } from "./infra/db.js";
import { config } from "./config.js";

async function streamToBuffer(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function extractProcessedKey(filePath) {
  const prefix = `${config.processedBucket}/`;

  if (filePath.startsWith(prefix)) {
    return filePath.slice(prefix.length);
  }

  return filePath;
}

async function downloadFrames(videoId, files) {
  const targetDir = path.join(config.localFramesDir, videoId);
  await fs.mkdir(targetDir, { recursive: true });

  const downloadedFiles = [];

  for (const filePath of files) {
    const key = extractProcessedKey(filePath);

    const response = await s3.send(
      new GetObjectCommand({
        Bucket: config.processedBucket,
        Key: key,
      })
    );

    if (!response.Body) {
      throw new Error(`Frame sem Body no S3: ${filePath}`);
    }

    const buffer = await streamToBuffer(response.Body);
    const fileName = path.basename(key);
    const localPath = path.join(targetDir, fileName);

    await fs.writeFile(localPath, buffer);

    downloadedFiles.push({
      key,
      fileName,
      localPath,
      fileSize: buffer.length,
    });
  }

  return {
    targetDir,
    downloadedFiles,
  };
}

async function createZip(
  videoId,
  inputFiles,
  originalFileName
)
{
  await fs.mkdir(config.localZipDir, { recursive: true });

  const baseName =
  originalFileName
    ? originalFileName.replace(/\.[^/.]+$/, "")
    : videoId;

const zipFileName =
  `${baseName}-fragments.zip`;

  const zipPath = path.join(config.localZipDir, zipFileName);

  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", async () => {
      try {
        const stats = await fs.stat(zipPath);
        resolve({
          zipFileName,
          zipPath,
          zipSize: stats.size,
        });
      } catch (error) {
        reject(error);
      }
    });

    archive.on("error", (err) => reject(err));
    archive.pipe(output);

    for (const file of inputFiles) {
      archive.file(file.localPath, { name: file.fileName });
    }

    archive.finalize();
  });
}

async function uploadZipToS3(videoId, zipPath) {
  const body = await fs.readFile(zipPath);
  const key = `${videoId}.zip`;

  await s3.send(
    new PutObjectCommand({
      Bucket: config.zipBucket,
      Key: key,
      Body: body,
      ContentType: "application/zip",
    })
  );

  return {
    key,
    s3Path: `${config.zipBucket}/${key}`,
    fileSize: body.length,
  };
}

async function finalizeZipCompleted(videoId, zipS3Path) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      UPDATE videos
      SET status = $1::varchar, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2::uuid
      `,
      ["COMPLETED", videoId]
    );

    await client.query(
      `
      UPDATE jobs
      SET status = $1::varchar, updated_at = CURRENT_TIMESTAMP
      WHERE video_id = $2::uuid
        AND type = $3::varchar
      `,
      ["COMPLETED", videoId, "ZIP"]
    );

    await client.query(
      `
      DELETE FROM outputs
      WHERE video_id = $1::uuid
        AND type = $2::varchar
      `,
      [videoId, "ZIP"]
    );

    await client.query(
      `
      INSERT INTO outputs (id, video_id, type, s3_path)
      VALUES ($1::uuid, $2::uuid, $3::varchar, $4::varchar)
      `,
      [uuidv4(), videoId, "ZIP", zipS3Path]
    );

    await client.query(
      `
      INSERT INTO events (id, event_type, source, payload)
      VALUES ($1::uuid, $2::varchar, $3::varchar, $4::jsonb)
      `,
      [
        uuidv4(),
        "VIDEO_COMPLETED",
        "zip-service",
        JSON.stringify({
          video_id: videoId,
          zip_path: zipS3Path,
          status: "COMPLETED",
        }),
      ]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function processMessage(message) {
  if (!message.Body) {
    console.log("Mensagem sem Body, ignorando...");
    return;
  }

  const parsed = JSON.parse(message.Body);

  if (parsed.event_type !== "FRAMES_READY") {
    console.log("Evento ignorado:", parsed.event_type);
    return;
  }

  const {
  video_id,
  files,
  user_email,
  original_file_name
} = parsed.payload || {};
  
  console.log("Payload recebido:", parsed.payload);

  if (!video_id || !Array.isArray(files) || files.length === 0) {
    throw new Error("Payload inválido: video_id/files ausentes");
  }

  const videoId = video_id;

  console.log("Processando ZIP para vídeo:", videoId);
  console.log("Quantidade de frames recebidos:", files.length);

  // 1. Baixa os frames
  const frames = await downloadFrames(videoId, files);

  console.log("Frames baixados localmente:", {
    video_id: videoId,
    targetDir: frames.targetDir,
    files: frames.downloadedFiles.map((f) => f.fileName),
  });

  // 2. Gera o zip
  const zipResult = await createZip(
  videoId,
  frames.downloadedFiles,
  original_file_name
);

  console.log("ZIP gerado localmente:", zipResult);

  // 3. Envia o zip para o S3
  const uploadedZip = await uploadZipToS3(videoId, zipResult.zipPath);

  console.log("ZIP enviado para S3:", uploadedZip);

// 4. Atualiza banco e eventos
  await finalizeZipCompleted(
    videoId,
    uploadedZip.s3Path
  );

  // 5. Publica evento para notification-service
  if (user_email) {

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: config.notificationQueueUrl,

        MessageBody: JSON.stringify({
          event_type: "VIDEO_COMPLETED",

          payload: {
            video_id: videoId,
            user_email,
            zip_path: uploadedZip.s3Path
          }
        })
      })
    );

    console.log(
      "Notificação VIDEO_COMPLETED enviada:",
      {
        video_id: videoId,
        user_email
      }
    );
  }

  console.log("Vídeo finalizado como COMPLETED:", {
    video_id: videoId,
    zip_path: uploadedZip.s3Path,
  });

}

async function pollQueue() {
  try {
    const response = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: config.zipQueueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 10,
        VisibilityTimeout: 30,
      })
    );

    if (!response.Messages || response.Messages.length === 0) {
      console.log("Nenhuma mensagem disponível...");
      return;
    }

    for (const message of response.Messages) {
      try {
        await processMessage(message);

        if (message.ReceiptHandle) {
          await sqs.send(
            new DeleteMessageCommand({
              QueueUrl: config.zipQueueUrl,
              ReceiptHandle: message.ReceiptHandle,
            })
          );
          console.log("Mensagem removida da fila com sucesso");
        }
      } catch (error) {
        console.error(JSON.stringify({
  level: "error",
  service: "zip-service",
  message: "Falha no processamento do ZIP",
  error: error.message,
  stack: error.stack,
  timestamp: new Date().toISOString()
}));
      }
    }
  } catch (error) {
    console.error("Erro ao consultar fila zip-generation:", error.message);
  }
}

async function bootstrap() {
  try {
    await pool.query("SELECT 1");
    console.log("Conexão com Postgres OK");
    console.log("Zip service iniciado. Versão: passo-9-fix-1");
    console.log("Fila escutada:", config.zipQueueName);
    console.log("Diretório local de frames:", config.localFramesDir);
    console.log("Diretório local de zip:", config.localZipDir);

    setInterval(async () => {
      await pollQueue();
    }, 5000);
  } catch (error) {
    console.error("Erro ao iniciar zip-service:", error.message);
    process.exit(1);
  }
}

bootstrap();