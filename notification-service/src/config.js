export const config = {
  awsRegion: process.env.AWS_REGION || "us-east-1",
  awsEndpoint: process.env.AWS_ENDPOINT,

  notificationQueueUrl:
    process.env.SQS_NOTIFICATION_QUEUE_URL ||
    `${process.env.AWS_ENDPOINT}/000000000000/notification`,
};