export const config = {
  awsRegion: process.env.AWS_REGION || "us-east-1",
  awsEndpoint: process.env.AWS_ENDPOINT,

  processedBucket: process.env.S3_PROCESSED_BUCKET || "processed-images",
  zipBucket: process.env.S3_ZIP_BUCKET || "zip-files",

  zipQueueName: process.env.SQS_ZIP_QUEUE || "zip-generation",
  zipQueueUrl:
    process.env.SQS_ZIP_QUEUE_URL ||
    `${process.env.AWS_ENDPOINT}/000000000000/${process.env.SQS_ZIP_QUEUE || "zip-generation"}`,

  dbHost: process.env.DB_HOST,
  dbPort: Number(process.env.DB_PORT || 5432),
  dbName: process.env.DB_NAME,
  dbUser: process.env.DB_USER,
  dbPassword: process.env.DB_PASSWORD,

  localFramesDir: process.env.LOCAL_FRAMES_DIR || "/tmp/zip-input",
  localZipDir: process.env.LOCAL_ZIP_DIR || "/tmp/zips",

  notificationQueueName: process.env.SQS_NOTIFICATION_QUEUE || "notification",
  notificationQueueUrl:
    process.env.SQS_NOTIFICATION_QUEUE_URL ||
    `${process.env.AWS_ENDPOINT}/000000000000/${process.env.SQS_NOTIFICATION_QUEUE || "notification"}`,
};
