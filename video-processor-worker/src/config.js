export const config = {
  awsRegion: process.env.AWS_REGION || "us-east-1",
  awsEndpoint: process.env.AWS_ENDPOINT,

  rawBucket: process.env.S3_RAW_BUCKET || "raw-videos",
  processedBucket: process.env.S3_PROCESSED_BUCKET || "processed-images",

  videoQueueName: process.env.SQS_VIDEO_QUEUE || "video-processing",
  videoQueueUrl:
    process.env.SQS_VIDEO_QUEUE_URL ||
    `${process.env.AWS_ENDPOINT}/000000000000/${process.env.SQS_VIDEO_QUEUE || "video-processing"}`,

  zipQueueName: process.env.SQS_ZIP_QUEUE || "zip-generation",
  zipQueueUrl:
    process.env.SQS_ZIP_QUEUE_URL ||
    `${process.env.AWS_ENDPOINT}/000000000000/${process.env.SQS_ZIP_QUEUE || "zip-generation"}`,

  dbHost: process.env.DB_HOST,
  dbPort: Number(process.env.DB_PORT || 5432),
  dbName: process.env.DB_NAME,
  dbUser: process.env.DB_USER,
  dbPassword: process.env.DB_PASSWORD,

  localVideoDir: process.env.LOCAL_VIDEO_DIR || "/tmp/videos",
  localFramesDir: process.env.LOCAL_FRAMES_DIR || "/tmp/frames",
};