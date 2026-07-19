import newrelic from "newrelic";

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

import { sqs } from "./infra/sqs.js";
import { s3 } from "./infra/s3.js";
import { pool } from "./infra/db.js";
import { config } from "./config.js";

import { execFile } from "child_process";
import { promisify } from "util";


const execFileAsync = promisify(execFile);

async function streamToBuffer(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function extractKeyFromS3Path(s3Path) {
  const prefix = `${config.rawBucket}/`;

  if (s3Path.startsWith(prefix)) {
    return s3Path.slice(prefix.length);
  }

  return s3Path;
}

async function downloadVideoFromS3(s3Path, video_id) {
  const key = extractKeyFromS3Path(s3Path);

  await fs.mkdir(config.localVideoDir, { recursive: true });

  const outputPath = path.join(
    config.localVideoDir,
    `${video_id}-${path.basename(key)}`
  );

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: config.rawBucket,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error("Resposta do S3 sem Body");
  }

  const buffer = await streamToBuffer(response.Body);
  await fs.writeFile(outputPath, buffer);

  return {
    key,
    outputPath,
    fileSize: buffer.length,
  };
}

async function createVideoFragments(
  video_id,
  videoPath
) {

  const fragmentDir =
    path.join(
      config.localFramesDir,
      video_id
    );

  await fs.mkdir(
    fragmentDir,
    { recursive: true }
  );

  const outputPattern =
    path.join(
      fragmentDir,
      "part-%03d.mp4"
    );

  await execFileAsync(
    "ffmpeg",
    [
      "-i",
      videoPath,

      "-c",
      "copy",

      "-f",
      "segment",

      "-segment_time",
      "10",

      "-reset_timestamps",
      "1",

      outputPattern
    ]
  );

  const files =
    await fs.readdir(fragmentDir);

  const fragments =
    files
      .filter(file =>
        file.endsWith(".mp4")
      )
      .sort()
      .map(file => ({
        fileName: file,
        localPath:
          path.join(
            fragmentDir,
            file
          ),
        contentType:
          "video/mp4"
      }));

  return {
    fragmentDir,
    fragments
  };

}

async function uploadFragmentsToS3(
  video_id,
  fragments
) {

  const uploaded = [];

  for (const fragment of fragments) {

    const body =
      await fs.readFile(
        fragment.localPath
      );

    const key =
      `${video_id}/${fragment.fileName}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: config.processedBucket,
        Key: key,
        Body: body,
        ContentType:
          fragment.contentType
      })
    );

    uploaded.push({
      key,
      s3Path:
        `${config.processedBucket}/${key}`,
      localPath:
        fragment.localPath,
    });

  }

  return uploaded;

}

async function registerEvent(eventType, source, payload) {
  const client = await pool.connect();

  try {
    await client.query(
      `
      INSERT INTO events (id, event_type, source, payload)
      VALUES ($1, $2, $3, $4::jsonb)
      `,
      [uuidv4(), eventType, source, JSON.stringify(payload)]
    );
  } finally {
    client.release();
  }
}

async function markProcessingStarted(video_id) {
  console.log(
  "STATUS ALTERADO PARA PROCESSING",
  video_id,
  new Date().toISOString()
);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      UPDATE videos
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      ["PROCESSING", video_id]
    );

    await client.query(
      `
      UPDATE jobs
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE video_id = $2
        AND type = $3
      `,
      ["RUNNING", video_id, "PROCESSING"]
    );

    await client.query(
      `
      INSERT INTO events (id, event_type, source, payload)
      VALUES ($1, $2, $3, $4::jsonb)
      `,
      [
        uuidv4(),
        "VIDEO_PROCESSING_STARTED",
        "video-processor-worker",
        JSON.stringify({
          video_id: video_id,
          status: "PROCESSING",
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

async function finalizeFramesExtracted(
    video_id,
    uploadedFrames,
    userEmail
  ) {
  const client = await pool.connect();

  try {
    const imagesPath = `${config.processedBucket}/${video_id}/`;
    const zipJobId = uuidv4();
    const eventId = uuidv4();

    const videoResult = await client.query(
        `
        SELECT file_name
        FROM videos
        WHERE id = $1
        LIMIT 1
        `,
        [video_id]
      );

const originalFileName =
  videoResult.rows[0]?.file_name;

    const eventPayload = {
      event_id: eventId,
      event_type: "FRAMES_READY",
      source: "video-processor-worker",
      payload: {
        video_id: video_id,
        user_email: userEmail,
        original_file_name: originalFileName,
        images_path: imagesPath,
        frames_count: uploadedFrames.length,
        files: uploadedFrames.map((f) => f.s3Path),
      },
      created_at: new Date().toISOString(),
    };

    await client.query("BEGIN");

    // 1. Finaliza a etapa PROCESSING
    await client.query(
      `
      UPDATE videos
      SET status = $1::varchar, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2::uuid
      `,
      ["FRAMES_EXTRACTED", video_id]
    );

    await client.query(
      `
      UPDATE jobs
      SET status = $1::varchar, updated_at = CURRENT_TIMESTAMP
      WHERE video_id = $2::uuid
        AND type = $3::varchar
      `,
      ["COMPLETED", video_id, "PROCESSING"]
    );

    // 2. Mantém apenas 1 output IMAGES por vídeo
    await client.query(
      `
      DELETE FROM outputs
      WHERE video_id = $1::uuid
        AND type = $2::varchar
      `,
      [video_id, "IMAGES"]
    );

    await client.query(
      `
      INSERT INTO outputs (id, video_id, type, s3_path)
      VALUES ($1::uuid, $2::uuid, $3::varchar, $4::varchar)
      `,
      [uuidv4(), video_id, "IMAGES", imagesPath]
    );

    // 3. Só cria o job ZIP se ainda não existir
    const existingZipJob = await client.query(
      `
      SELECT id
      FROM jobs
      WHERE video_id = $1::uuid
        AND type = $2::varchar
      LIMIT 1
      `,
      [video_id, "ZIP"]
    );

    if (existingZipJob.rowCount === 0) {
      await client.query(
        `
        INSERT INTO jobs (id, video_id, type, status, attempts)
        VALUES ($1::uuid, $2::uuid, $3::varchar, $4::varchar, $5::int)
        `,
        [zipJobId, video_id, "ZIP", "PENDING", 0]
      );
    }

    // 4. Registra FRAMES_READY
    await client.query(
      `
      INSERT INTO events (id, event_type, source, payload)
      VALUES ($1::uuid, $2::varchar, $3::varchar, $4::jsonb)
      `,
      [
        eventId,
        "FRAMES_READY",
        "video-processor-worker",
        JSON.stringify(eventPayload.payload),
      ]
    );

    await client.query("COMMIT");

    return eventPayload;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function publishFramesReady(eventPayload) {
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: config.zipQueueUrl,
      MessageBody: JSON.stringify(eventPayload),
    })
  );
}

async function publishProcessingNotification(
  videoId,
  userEmail
) {
  await sqs.send(
    new SendMessageCommand({
      QueueUrl:
        process.env.SQS_NOTIFICATION_QUEUE_URL,

      MessageBody: JSON.stringify({
        event_type: "VIDEO_PROCESSING",

        payload: {
          video_id: videoId,
          user_email: userEmail
        }
      })
    })
  );
}

async function processMessage(message) {
  return newrelic.startBackgroundTransaction(
    "process-video",
    async () => {
      const transaction = newrelic.getTransaction();

      try {
        if (!message.Body) {
          console.log("Mensagem sem body, ignorando...");
          return;
        }

        const parsed = JSON.parse(message.Body);

        if (parsed.event_type !== "VIDEO_UPLOADED") {
          console.log("Evento ignorado:", parsed.event_type);
          return;
        }

        const {
          video_id,
          s3_path,
          user_email
        } = parsed.payload || {};

        if (!video_id || !s3_path) {
          throw new Error(
            "Payload inválido: video_id ou s3_path ausente"
          );
        }

        console.log(JSON.stringify({
          level: "info",
          service: "video-worker",
          message: "Processando vídeo",
          video_id,
          timestamp: new Date().toISOString()
        }));

        console.log("Origem no S3:", s3_path);

        // 1. Marca vídeo como PROCESSING
        await markProcessingStarted(video_id);

        await new Promise(resolve =>
          setTimeout(resolve, 15000)
        );

        // Notifica usuário
        if (user_email) {
          await publishProcessingNotification(
            video_id,
            user_email
          );
        }

        // 2. Download do vídeo
        const downloadResult =
          await downloadVideoFromS3(
            s3_path,
            video_id
          );

        console.log("Download concluído:", {
          video_id,
          key: downloadResult.key,
          outputPath: downloadResult.outputPath,
          fileSize: downloadResult.fileSize,
        });

        await registerEvent(
          "VIDEO_DOWNLOADED",
          "video-processor-worker",
          {
            video_id,
            s3_path,
            local_path: downloadResult.outputPath,
            file_size: downloadResult.fileSize,
          }
        );

        // 3. Geração de frames
        const fragments =
          await createVideoFragments(
            video_id,
            downloadResult.outputPath
          );

        console.log("Fragmentos criados:", {
          video_id,
          fragmentDir: fragments.fragmentDir,
          fragments: fragments.fragments.map(
            (f) => f.fileName
          ),
        });

        // 4. Upload dos frames
        const uploadedFragments =
          await uploadFragmentsToS3(
            video_id,
            fragments.fragments
          );

        await new Promise(resolve =>
          setTimeout(resolve, 15000)
        );

        // 5. Finalização
        const framesReadyEvent =
          await finalizeFramesExtracted(
            video_id,
            uploadedFragments,
            user_email
          );

        console.log(
          "Evento FRAMES_READY preparado:",
          framesReadyEvent
        );

        // 6. Publica na fila ZIP
        await publishFramesReady(framesReadyEvent);

        console.log(
          "Evento publicado na fila zip-generation:",
          {
            video_id,
            queue: config.zipQueueName,
          }
        );

        console.log(
          "Vídeo finalizado nesta etapa como FRAMES_EXTRACTED:",
          video_id
        );

      } catch (error) {

        newrelic.noticeError(error);
        throw error;

      } finally {

        transaction.end();

      }
    }
  );
}

async function pollQueue() {
  try {
    const command = new ReceiveMessageCommand({
      QueueUrl: config.videoQueueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 10,
      VisibilityTimeout: 30,
    });

    const response = await sqs.send(command);

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
              QueueUrl: config.videoQueueUrl,
              ReceiptHandle: message.ReceiptHandle,
            })
          );

          console.log("Mensagem removida da fila com sucesso");
        }
      } catch (error) {
        console.error("Falha no processamento da mensagem:", error.message);
        // não remove da fila em caso de erro
      }
    }
  } catch (error) {
    console.error("Erro ao consultar fila:", error.message);
  }
}

async function bootstrap() {
  try {
    await pool.query("SELECT 1");
    console.log("Conexão com Postgres OK");
    console.log("Worker iniciado. Versão: passo-8-fix-1");
    console.log("Worker escutando fila:", config.videoQueueName);
    console.log("Diretório local de download:", config.localVideoDir);
    console.log("Diretório local de frames:", config.localFramesDir);
    console.log("Fila de saída do ZIP:", config.zipQueueName);

    setInterval(async () => {
      await pollQueue();
    }, 5000);
  } catch (error) {
    console.error("Erro ao iniciar worker:", error.message);
    process.exit(1);
  }
}

bootstrap();