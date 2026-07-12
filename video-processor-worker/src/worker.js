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

async function createMockFrames(video_id) {
  const frameDir = path.join(config.localFramesDir, video_id);
  await fs.mkdir(frameDir, { recursive: true });

  const frames = [];

  for (let i = 1; i <= 3; i++) {
    const fileName = `frame-00${i}.jpg`;
    const localPath = path.join(frameDir, fileName);

    const fakeImageContent = `fake-jpg-content video=${video_id} frame=${i}`;
    await fs.writeFile(localPath, Buffer.from(fakeImageContent));

    frames.push({
      fileName,
      localPath,
      contentType: "image/jpeg",
    });
  }

  return {
    frameDir,
    frames,
  };
}

async function uploadFramesToS3(video_id, frames) {
  const uploaded = [];

  for (const frame of frames) {
    const body = await fs.readFile(frame.localPath);
    const key = `${video_id}/${frame.fileName}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: config.processedBucket,
        Key: key,
        Body: body,
        ContentType: frame.contentType,
      })
    );

    uploaded.push({
      key,
      s3Path: `${config.processedBucket}/${key}`,
      localPath: frame.localPath,
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

    const eventPayload = {
      event_id: eventId,
      event_type: "FRAMES_READY",
      source: "video-processor-worker",
      payload: {
        video_id: video_id,
        user_email: userEmail,
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
    throw new Error("Payload inválido: video_id ou s3_path ausente");
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
  // 1. Marca vídeo como PROCESSING
  await markProcessingStarted(video_id);

  // Notifica usuário
  if (user_email) {
    await publishProcessingNotification(
      video_id,
      user_email
    );
  }

  // 2. Download do vídeo
  const downloadResult = await downloadVideoFromS3(s3_path, video_id);

  console.log("Download concluído:", {
    video_id,
    key: downloadResult.key,
    outputPath: downloadResult.outputPath,
    fileSize: downloadResult.fileSize,
  });

  await registerEvent("VIDEO_DOWNLOADED", "video-processor-worker", {
    video_id,
    s3_path,
    local_path: downloadResult.outputPath,
    file_size: downloadResult.fileSize,
  });

  // 3. Geração fake de frames
  const mockFrames = await createMockFrames(video_id);

  console.log("Frames mock criados:", {
    video_id,
    frameDir: mockFrames.frameDir,
    frames: mockFrames.frames.map((f) => f.fileName),
  });

  // 4. Upload dos frames para o bucket processado
  const uploadedFrames = await uploadFramesToS3(video_id, mockFrames.frames);

  console.log("Frames enviados para S3:", {
    video_id,
    count: uploadedFrames.length,
    files: uploadedFrames.map((f) => f.s3Path),
  });

  // 5. Fecha etapa no banco + cria ZIP job + gera payload do evento
  const framesReadyEvent =
    await finalizeFramesExtracted(
      video_id,
      uploadedFrames,
      user_email
    );

  console.log("Evento FRAMES_READY preparado:", framesReadyEvent);

  // 6. Publica na fila do ZIP
  await publishFramesReady(framesReadyEvent);

  console.log("Evento publicado na fila zip-generation:", {
    video_id,
    queue: config.zipQueueName,
  });

  console.log("Vídeo finalizado nesta etapa como FRAMES_EXTRACTED:", video_id);
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