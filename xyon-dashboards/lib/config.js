// ============================================================
// EDIT THIS BLOCK TO MATCH YOUR DATA, THEN STOP.
// ============================================================
// The BigQuery table that holds your performance data (the same
// table your Looker Studio report reads from). Full name, as
// "project.dataset.table". Find it in BigQuery Studio, or in
// Looker Studio under Resource -> Manage added data sources.
export const BQ_TABLE = "your-project.your_dataset.your_table";
// Where your dataset lives. Leave blank ("") for US/EU multi-region
// datasets; otherwise set it, e.g. "australia-southeast1".
export const BQ_LOCATION = "";
// The Google Sheet tab that maps a secret token to a creator code.
// Tokens stay in a sheet so you can add a creator without redeploying.
export const TOKENS_TAB = "Tokens";
// Column names, exactly as they appear in your BigQuery table.
export const COLUMNS = {
  creatorCode: "Creator_Code",
  date: "Date",
  clicks: "Clicks",
  redemptions: "Redemptions",
  revenue: "Revenue",
  commission: "Commission",
};
// ============================================================
// STOP EDITING.
// ============================================================
