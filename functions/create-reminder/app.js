const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { PutCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");
const { SchedulerClient, CreateScheduleCommand } = require("@aws-sdk/client-scheduler");

const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "Etc/UTC";

const schedulerClient = new SchedulerClient({});
const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const isValidTimezone = (tz) => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

exports.handler = async (event) => {
  const body = JSON.parse(event.body);

  if (!body.message || !body.scheduledAt || !body.email) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "message, scheduledAt y email son requeridos" }),
    };
  }

  const timezone = body.timezone || DEFAULT_TIMEZONE;
  if (!isValidTimezone(timezone)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: `timezone inválida: "${timezone}". Usa un nombre IANA, ej. America/Mexico_City`,
      }),
    };
  }

  const reminder = {
    id: randomUUID(),
    message: body.message,
    scheduledAt: body.scheduledAt,
    email: body.email,
    timezone,
    status: "PENDING",
  };

  await client.send(
    new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: reminder,
    })
  );

  await schedulerClient.send(
    new CreateScheduleCommand({
      Name: `reminder-${reminder.id}`,
      ScheduleExpression: `at(${reminder.scheduledAt.slice(0, 19)})`, // Recibe en formato yyyy-mm-ddThh:mm:ss en la zona de `timezone`
      ScheduleExpressionTimezone: timezone,
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