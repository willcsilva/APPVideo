export const config = {
  awsRegion: process.env.AWS_REGION || "us-east-1",
  awsEndpoint: process.env.AWS_ENDPOINT,

  rawBucket:
    process.env.S3_RAW_BUCKET || "raw-videos",

  processedBucket:
    process.env.S3_PROCESSED_BUCKET || "processed-images",

  zipBucket:
    process.env.S3_ZIP_BUCKET || "zip-files",

  queueName:
    process.env.SQS_VIDEO_QUEUE ||
    "video-processing",

  queueUrl:
    process.env.SQS_VIDEO_QUEUE_URL ||
    `${process.env.AWS_ENDPOINT}/000000000000/${
      process.env.SQS_VIDEO_QUEUE ||
      "video-processing"
    }`,

  notificationQueueName:
    process.env.SQS_NOTIFICATION_QUEUE ||
    "notification",

  notificationQueueUrl:
    process.env.SQS_NOTIFICATION_QUEUE_URL ||
    `${process.env.AWS_ENDPOINT}/000000000000/${
      process.env.SQS_NOTIFICATION_QUEUE ||
      "notification"
    }`,
};