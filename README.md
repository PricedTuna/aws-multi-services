# recordatorios-diferidos

A small serverless **reminder scheduler** built on AWS with SAM (Serverless Application Model).

> **Purpose:** This is a learning / practice project. Its main goal is to exercise the
> integration between several AWS services working together — API Gateway, Lambda,
> DynamoDB, **EventBridge Scheduler**, **SQS** (with a dead-letter queue), and SES —
> rather than to be a production-ready product.

You POST a reminder with a future date. A schedule is created that, at the right time,
drops a message into an SQS queue. A consumer Lambda then sends the reminder by email
and updates its status in DynamoDB.

---

## Architecture

```
                POST /reminders
   Client ─────────────────────────▶ API Gateway
                                        │
                                        ▼
                            CreateReminderFunction
                              │             │
                    (PutCommand)             (CreateSchedule)
                              ▼             ▼
                         DynamoDB     EventBridge Scheduler
                                        │
                                        │ (fires at scheduledAt, sends message)
                                        ▼
                                  RemindersQueue (SQS)
                                        │
                                        ▼
                            SendReminderFunction
                              │             │
                     (SendEmail)             (UpdateCommand)
                              ▼             ▼
                            SES          DynamoDB


                GET /reminders/{id}
   Client ─────────────────────────▶ API Gateway
                                        │
                                        ▼
                            GetReminderFunction ──▶ DynamoDB
```

**Services involved**

| Service              | Role                                                            |
| -------------------- | --------------------------------------------------------------- |
| API Gateway          | REST endpoints `/reminders` (POST) and `/reminders/{id}` (GET)  |
| Lambda (Node.js 22)  | `CreateReminderFunction`, `GetReminderFunction`, `SendReminderFunction` |
| DynamoDB             | `RemindersProductionTable` stores each reminder and its status  |
| EventBridge Scheduler| Fires once at `scheduledAt` and sends the message to SQS        |
| SQS                  | `RemindersQueue` decouples scheduling from email delivery       |
| SQS DLQ              | `RemindersDLQ` catches messages that fail after 3 attempts      |
| SES                  | Sends the actual reminder email                                 |

**Reminder status flow:** `PENDING` → `SENT` (or `FAILED` on error).

---

## Project structure

```
.
├── template.yaml            # SAM template: all AWS resources
├── samconfig.toml           # SAM CLI settings (stack name, build, deploy)
├── local-env.json           # Env vars for local invocation (points to DynamoDB Local)
├── events/                  # Sample events for `sam local invoke`
│   ├── create-event.json
│   └── get.json
├── functions/
│   ├── create-reminder/     # POST /reminders handler
│   ├── get-reminder/        # GET /reminders/{id} handler
│   └── send-reminder/       # SQS consumer: sends email + updates status
└── PRUEBA-LOCAL.txt         # Step-by-step guide to run everything locally
```

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (for `sam local` and DynamoDB Local)
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)
- [Node.js 22+](https://nodejs.org/)
- AWS CLI configured: `aws configure` or `aws sso login`

---

## Run locally

For a detailed, step-by-step walkthrough see **[PRUEBA-LOCAL.txt](./PRUEBA-LOCAL.txt)**.
Quick version:

```bash
# 1. Start DynamoDB Local (only if not already running)
docker run -d --name dynamodb-local \
  -p 8000:8000 \
  -v ~/.dynamodb-local/data:/home/dynamodblocal/data \
  amazon/dynamodb-local \
  -jar DynamoDBLocal.jar -dbPath /home/dynamodblocal/data

# 2. Create the table in DynamoDB Local
aws dynamodb create-table \
  --endpoint-url http://localhost:8000 \
  --table-name RemindersProductionTable \
  --key-schema AttributeName=id,KeyType=HASH \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --billing-mode PAY_PER_REQUEST

# 3. Build the functions
sam build

# 4. Invoke a function locally
sam local invoke CreateReminderFunction \
  --event events/create-event.json \
  --env-vars local-env.json

# 5. Inspect what was stored
aws dynamodb scan \
  --table-name RemindersProductionTable \
  --endpoint-url http://localhost:8000
```

You can also run the whole API locally on port 3000:

```bash
sam local start-api --env-vars local-env.json
curl -X POST http://localhost:3000/reminders \
  -H "Content-Type: application/json" \
  -d '{"message":"prueba","scheduledAt":"2026-09-24T18:00:00Z","email":"you@example.com"}'
```

### Notes on local testing

- `local-env.json` overrides `TABLE_NAME` and `AWS_ENDPOINT_URL_DYNAMODB` so the
  functions talk to DynamoDB Local instead of real AWS.
- The endpoint uses `172.17.0.1` (the Docker bridge IP). Inside the SAM container on
  Linux, `localhost` does **not** reach your host.
- `AWS_ENDPOINT_URL_DYNAMODB` is declared (empty) in `template.yaml` so SAM can inject
  the local override. In the cloud the empty value makes the SDK use the real AWS endpoint.

---

## Deploy to AWS

Make sure your AWS credentials are configured, then:

```bash
sam build
sam deploy --guided
```

The guided deploy will ask for the stack name, region, and whether to allow IAM role
creation (answer **yes** — the app needs `CAPABILITY_IAM`). Settings are saved to
`samconfig.toml`, so later deploys only need:

```bash
sam build && sam deploy
```

After deployment, the API Gateway endpoint URL is printed in the stack **Outputs**.

### SES setup

SES starts in **sandbox mode**: the sender and every recipient address must be verified.
Verify them in the SES console (or via the CLI) before testing real emails. To send to
unverified addresses you must request production access for SES.

### Tail logs

```bash
sam logs -n SendReminderFunction --stack-name recordatorios-diferidos --tail
```

---

## Cleanup

```bash
sam delete --stack-name recordatorios-diferidos
```

---

## Tech stack

- AWS SAM / CloudFormation
- AWS Lambda (Node.js 22.x)
- Amazon API Gateway, DynamoDB, EventBridge Scheduler, SQS, SES
- AWS SDK for JavaScript v3

## Resources

- [AWS SAM developer guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)
- [EventBridge Scheduler](https://docs.aws.amazon.com/scheduler/latest/developerguide/what-is-scheduler.html)
- [Amazon SQS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html)
