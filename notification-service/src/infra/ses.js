import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

export const ses = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  endpoint: process.env.AWS_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export async function sendEmail(to, subject, body) {
  const command = new SendEmailCommand({
    Source:
    process.env.EMAIL_FROM ||
    "willow@willow.tec.br",
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: { Data: subject },
      Body: {
        Text: { Data: body },
      },
    },
  });

  await ses.send(command);
}