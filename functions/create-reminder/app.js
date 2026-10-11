const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { FlexibleTimeWindow$ } = require("@aws-sdk/client-scheduler");
const { PutCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");
const { SchedulerClient, CreateScheduleCommand } = require("@aws-sdk/client-scheduler");

const schedulerClient = new SchedulerClient({});
const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  const body = JSON.parse(event.body);

  if (!body.message || !body.scheduledAt || !body.email) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "message, scheduledAt y email son requeridos" }),
    };
  }

  const reminder = {
    id: randomUUID(),
    message: body.message,
    scheduledAt: body.scheduledAt,
    email: body.email,
    status: "PENDING",
  };

  await client.send(
    new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: reminder,
    })
  );

  await SchedulerClient.send(
    new CreateScheduleCommand({
      Name: `reminder-${reminder.id}`,
      ScheduleExpression: `at(${reminder.scheduledAt.slice(0, 19)})`, // Recibe en formato yyyy-mm-ddThh:mm:ss
      FlexibleTimeWindow: {Mode:"OFF"},
      Target: {
        Arn:process.env.QUEUE_ARN,
        RoleArn: process.env.SCHEDULER_ROLE_ARN,
        Input: JSON.stringify(reminder)
      }
    })
  )

  return {
    statusCode: 201,
    body: JSON.stringify(reminder),
  };
};