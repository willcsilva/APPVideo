import { S3Client } from "@aws-sdk/client-s3";
import { config } from "../config.js";

export const s3 = new S3Client({
  region: config.awsRegion,

  ...(config.awsEndpoint && {
    endpoint: config.awsEndpoint,
    forcePathStyle: true,
  }),
});