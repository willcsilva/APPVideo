import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";

import { sqs } from "./infra/sqs.js";
import { sendEmail } from "./infra/ses.js";
import { config } from "./config.js";

async function processMessage(message) {
  const parsed = JSON.parse(message.Body);

  if (parsed.event_type === "VIDEO_COMPLETED") {
    const { video_id, zip_path } = parsed.payload;

    console.log("Enviando notificação de sucesso:", video_id);

    await sendEmail(
      "teste@fiap.com",
      "Processamento concluído",
      `Seu vídeo ${video_id} foi processado.
Download: ${zip_path}`
    );
  }
}

async function pollQueue() {
  const response = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: config.notificationQueueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 10,
    })
  );

  if (!response.Messages) return;

  for (const message of response.Messages) {
    await processMessage(message);

    await sqs.send(
      new DeleteMessageCommand({
        QueueUrl: config.notificationQueueUrl,
        ReceiptHandle: message.ReceiptHandle,
      })
    );
  }
}

setInterval(pollQueue, 5000);