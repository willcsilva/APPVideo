import { config } from "../config.js";

const isLocal = config.awsEndpoint;

export const s3 = new S3Client({
  region: config.awsRegion,
  ...(isLocal && {
    endpoint: config.awsEndpoint,
    forcePathStyle: true,
  }),
});