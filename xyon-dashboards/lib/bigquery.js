import { BigQuery } from "@google-cloud/bigquery";
import { BQ_TABLE, BQ_LOCATION, COLUMNS } from "./config";
// Builds a BigQuery client using the same service account key as the
// token sheet. The key's own project_id is used as the billing project.
function getBigQueryClient() {
  const json = Buffer.from(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64,
    "base64"
  ).toString("utf8");
  const credentials = JSON.parse(json);
  return new BigQuery({ projectId: credentials.project_id, credentials });
}
// Returns only the given creator's rows. The WHERE clause runs inside
// BigQuery, so other creators' data never leaves the warehouse.
export async function readCreatorRows(creatorName) {
  const bigquery = getBigQueryClient();
  const col = (name) => "`" + name.replace(/`/g, "") + "`";
  const query = `
    SELECT
      ${col(COLUMNS.date)} AS date,
      ${col(COLUMNS.event)} AS event,
      ${col(COLUMNS.qty)} AS qty,
      ${col(COLUMNS.amount)} AS amount
    FROM \`${BQ_TABLE.replace(/`/g, "")}\`
    WHERE ${col(COLUMNS.creatorName)} = @creatorName
  `;
  const [rows] = await bigquery.query({
    query,
    params: { creatorName },
    ...(BQ_LOCATION ? { location: BQ_LOCATION } : {}),
  });
  return rows;
}
