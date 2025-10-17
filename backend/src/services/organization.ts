import { SQSClient } from "@aws-sdk/client-sqs";

const sqsConfig = {
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "local",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "local",
  },
  ...(process.env.SQS_ENDPOINT && {
    endpoint: process.env.SQS_ENDPOINT,
  }),
};
const sqsClient = new SQSClient(sqsConfig);
export async function createOrganization() {}
