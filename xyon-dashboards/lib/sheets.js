import { google } from "googleapis";
// Builds a read-only Google Sheets client using the service account key.
function getSheetsClient() {
  const json = Buffer.from(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64,
    "base64"
  ).toString("utf8");
  const credentials = JSON.parse(json);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}
// Reads a whole tab and returns one object per row, keyed by the header row.
export async function readTab(spreadsheetId, tabName) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: tabName,
  });
  const rows = res.data.values || [];
  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  });
}
