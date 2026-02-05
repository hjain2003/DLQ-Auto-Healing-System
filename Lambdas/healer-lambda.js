// healer/index.mjs

import {
  SQSClient,
  SendMessageCommand
} from "@aws-sdk/client-sqs";

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand
} from "@aws-sdk/client-s3";

import {
  DynamoDBClient,
  DeleteItemCommand
} from "@aws-sdk/client-dynamodb";

import {
  SNSClient,
  PublishCommand
} from "@aws-sdk/client-sns";

const sqs = new SQSClient({});
const s3 = new S3Client({});
const db = new DynamoDBClient({});
const sns = new SNSClient({});

const MAIN_QUEUE_URL = process.env.MAIN_QUEUE_URL;
const ARCHIVE_BUCKET = process.env.ARCHIVE_BUCKET;
const FAILED_TABLE = process.env.FAILED_TABLE;
const ALERT_TOPIC_ARN = process.env.ALERT_TOPIC_ARN;

export const handler = async (event) => {
  for (const record of event.Records) {
    const payload = JSON.parse(record.body);
    const messageId = record.messageId;

    console.log("Processing DLQ message:", messageId, payload);

    let errorType = "LOGIC_OR_UNKNOWN";

    if (!payload.orderId) errorType = "BAD_PAYLOAD";
    else if (typeof payload.amount !== "number" || payload.amount < 0)
      errorType = "VALIDATION_ERROR";
    else if (payload.simulateError === "TIMEOUT")
      errorType = "TIMEOUT";
    else if (payload.simulateError === "AUTH")
      errorType = "AUTH";

    // -------- AUTO-HEAL TIMEOUTS --------
    if (errorType === "TIMEOUT") {
      delete payload.simulateError;
      payload._healed = true;

      await sqs.send(
        new SendMessageCommand({
          QueueUrl: MAIN_QUEUE_URL,
          MessageBody: JSON.stringify(payload)
        })
      );

      await db.send(
        new DeleteItemCommand({
          TableName: FAILED_TABLE,
          Key: { messageId: { S: messageId } }
        })
      );

      await s3.send(
        new DeleteObjectCommand({
          Bucket: ARCHIVE_BUCKET,
          Key: `TIMEOUT/${messageId}.json`
        })
      );

      console.log("Auto-healed TIMEOUT:", messageId);
      continue;
    }

    // -------- ALERT ON AUTH FAILURES --------
    if (errorType === "AUTH") {
      await sns.send(
        new PublishCommand({
          TopicArn: ALERT_TOPIC_ARN,
          Subject: "DLQ AUTH FAILURE",
          Message: JSON.stringify(payload, null, 2)
        })
      );
    }

    // -------- ARCHIVE PERMANENT FAILURES --------
    await s3.send(
      new PutObjectCommand({
        Bucket: ARCHIVE_BUCKET,
        Key: `${errorType}/${messageId}.json`,
        Body: JSON.stringify(payload, null, 2),
        ContentType: "application/json"
      })
    );

    console.log("Archived failure:", errorType, messageId);
  }
};
