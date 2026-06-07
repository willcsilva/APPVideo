export const config = {
  env: process.env.NODE_ENV || "development",

  // AWS
  awsRegion: process.env.AWS_REGION,
  awsEndpoint: process.env.AWS_ENDPOINT || null,

  // S3
  s3RawBucket: process.env.S3_RAW_BUCKET,
  s3ProcessedBucket: process.env.S3_PROCESSED_BUCKET,
  s3ZipBucket: process.env.S3_ZIP_BUCKET,

  // SQS
  sqsVideoQueue: process.env.SQS_VIDEO_QUEUE,
  sqsZipQueue: process.env.SQS_ZIP_QUEUE,
  sqsNotificationQueue: process.env.SQS_NOTIFICATION_QUEUE,

  // DB
  dbHost: process.env.DB_HOST,
  dbPort: process.env.DB_PORT,
  dbName: process.env.DB_NAME,
  dbUser: process.env.DB_USER,
  dbPassword: process.env.DB_PASSWORD,
};