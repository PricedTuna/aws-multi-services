const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { GetCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const response = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  const id = event.pathParameters?.id;
  if (!id) return response(400, { error: "id requerido" });

  try {
    const params = { 
      TableName: process.env.TABLE_NAME, 
      Key: { id } 
    }
    const { Item } = await client.send(new GetCommand(params));

    if (!Item) return response(404, { error: "Recordatorio no encontrado" });
    return response(200, Item)
  } catch (err) {
    console.error("Error en GetItem", { id, err });
    return response(500, { error: "Error interno" })
  }
}