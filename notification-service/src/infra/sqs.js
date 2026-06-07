import { config } from "../config.js";

const isLocal = config.awsEndpoint;

export const sqs = new SQSClient({
  region: config.awsRegion,
  ...(config.awsEndpoint && {
    endpoint: config.awsEndpoint,
  }),
});