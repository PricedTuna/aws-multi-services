const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { UpdateCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});

exports.handler = async (event) => {
  for (const record of event.Records) {
    const reminder = JSON.parse(record.body);

    try {
      await ses.send(
        new SendEmailCommand({
          Source: process.env.SES_SENDER_EMAIL,
          Destination: { ToAddresses: [reminder.email] },
          Message: {
            Subject: { Data: "Tu recordatorio" },
            Body: { Text: { Data: reminder.message } },
          },
        })
      );

      await dynamo.send(
        new UpdateCommand({
          TableName: process.env.TABLE_NAME,
          Key: { id: reminder.id },
          UpdateExpression: "SET #s = :sent",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":sent": "SENT" },
        })
      );
    } catch (err) {
      await dynamo.send(
        new UpdateCommand({
          TableName: process.env.TABLE_NAME,
          Key: { id: reminder.id },
          UpdateExpression: "SET #s = :failed, #e = :error",
          ExpressionAttributeNames: { "#s": "status", "#e": "errorDetail" },
          ExpressionAttributeValues: { ":failed": "FAILED", ":error": err.message },
        })
      );
      throw err; // re-lanza para que SQS reintente / mande a DLQ
    }
  }
};