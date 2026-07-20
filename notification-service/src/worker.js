import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
} from "@aws-sdk/client-sqs";

import { sqs } from "./infra/sqs.js";
import { sendEmail } from "./infra/ses.js";
import { config } from "./config.js";

const DASHBOARD_URL =
  process.env.DASHBOARD_URL ||
  "http://localhost";

function calculateBackoffSeconds(receiveCount) {
  const attempt = Number(receiveCount || 1);

  if (attempt <= 1) return 10;
  if (attempt === 2) return 30;
  if (attempt === 3) return 60;
  if (attempt === 4) return 120;

  return 300;
}

function buildNotification(eventType, payload) {

  switch (eventType) {

    case "VIDEO_RECEIVED":
      return {
        subject: "APPVideo - Vídeo recebido",
        body: `
Seu vídeo foi recebido com sucesso.

ID do Vídeo:
${payload.video_id}

Acompanhe o processamento acessando:

${DASHBOARD_URL}
`
      };

    case "VIDEO_PROCESSING":
      return {
        subject: "APPVideo - Vídeo em processamento",
        body: `
Seu vídeo está em processamento.

ID do Vídeo:
${payload.video_id}

Acompanhe o progresso em:

${DASHBOARD_URL}
`
      };

    case "VIDEO_COMPLETED":
      return {
        subject: "APPVideo - Vídeo concluído",
        body: `
Seu vídeo foi processado com sucesso.

ID do Vídeo:
${payload.video_id}

ZIP:
${payload.zip_path || "Disponível no Dashboard"}

Acesse:

${DASHBOARD_URL}
`
      };

    default:
      return null;
  }
}

async function processMessage(message) {

  let parsed;

  try {

    parsed = JSON.parse(message.Body);

  } catch (err) {

    console.error(
      JSON.stringify({
        level: "error",
        service: "notification-service",
        message: "Mensagem inválida (JSON)",
        body: message.Body,
        timestamp: new Date().toISOString(),
      })
    );

    if (message.ReceiptHandle) {
      await sqs.send(
        new DeleteMessageCommand({
          QueueUrl: config.notificationQueueUrl,
          ReceiptHandle: message.ReceiptHandle,
        })
      );
    }

    return;
  }

  const notification =
    buildNotification(
      parsed.event_type,
      parsed.payload || {}
    );

  if (!notification) {
    return;
  }

  const recipient =
    parsed.payload?.user_email;

  if (!recipient) {

    console.error(
      JSON.stringify({
        level: "error",
        service: "notification-service",
        message: "Payload sem user_email",
        event_type: parsed.event_type,
        timestamp: new Date().toISOString(),
      })
    );

    return;
  }

  console.log(
    JSON.stringify({
      level: "info",
      service: "notification-service",
      message: "Enviando e-mail",
      event_type: parsed.event_type,
      recipient,
      timestamp: new Date().toISOString(),
    })
  );

  await sendEmail(
    recipient,
    notification.subject,
    notification.body
  );
}

async function pollQueue() {

  try {

    const response = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: config.notificationQueueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 10,
        VisibilityTimeout: 30,
        AttributeNames: ["All"],
      })
    );

    if (!response.Messages ||
        response.Messages.length === 0) {
      return;
    }

    for (const message of response.Messages) {

      try {

        await processMessage(message);

        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: config.notificationQueueUrl,
            ReceiptHandle: message.ReceiptHandle,
          })
        );

      } catch (error) {

        console.error(
          JSON.stringify({
            level: "error",
            service: "notification-service",
            message:
              "Falha no processamento da notificação",
            error: error.message,
            timestamp: new Date().toISOString(),
          })
        );

        try {

          const receiveCount =
            message.Attributes
              ?.ApproximateReceiveCount || "1";

          const backoffSeconds =
            calculateBackoffSeconds(
              receiveCount
            );

          if (message.ReceiptHandle) {

            await sqs.send(
              new ChangeMessageVisibilityCommand({
                QueueUrl:
                  config.notificationQueueUrl,

                ReceiptHandle:
                  message.ReceiptHandle,

                VisibilityTimeout:
                  backoffSeconds,
              })
            );

            console.log(
              JSON.stringify({
                level: "warn",
                service: "notification-service",
                message:
                  "Backoff aplicado à mensagem",

                receive_count:
                  receiveCount,

                visibility_timeout:
                  backoffSeconds,

                timestamp:
                  new Date().toISOString(),
              })
            );
          }

        } catch (visibilityError) {

          console.error(
            JSON.stringify({
              level: "error",
              service:
                "notification-service",

              message:
                "Erro ao aplicar backoff",

              error:
                visibilityError.message,

              timestamp:
                new Date().toISOString(),
            })
          );
        }
      }
    }

  } catch (err) {

    console.error(
      JSON.stringify({
        level: "error",
        service:
          "notification-service",

        message:
          "Erro no polling da fila",

        error: err.message,

        timestamp:
          new Date().toISOString(),
      })
    );
  }
}

setInterval(pollQueue, 5000);