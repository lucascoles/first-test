// ============================================================
// EDIT THIS BLOCK TO MATCH YOUR DATA, THEN STOP.
// ============================================================
// The BigQuery table behind the "Influencer Overview" Looker Studio
// page. Full name, as "project.dataset.table". Find it in BigQuery
// Studio, or in Looker Studio under Resource -> Manage added data
// sources.
export const BQ_TABLE = "your-project.your_dataset.your_table";
// Where your dataset lives. Leave blank ("") for US/EU multi-region
// datasets; otherwise set it, e.g. "australia-southeast1".
export const BQ_LOCATION = "";
// The Google Sheet tab that maps a secret token to a creator. The
// "Creator Code" column must hold the influencer_name exactly as it
// appears in BigQuery (e.g. "Jack Folkes").
export const TOKENS_TAB = "Tokens";
// Column names, exactly as they appear in your BigQuery table.
export const COLUMNS = {
  creatorName: "influencer_name",
  date: "date", // CONFIRM: the report has a date filter, but the column name isn't visible in it
  event: "event",
  qty: "qty",
  amount: "amount",
};
// Values of the event column that we turn into dashboard metrics.
export const EVENTS = {
  consultation: "consultation_submitted",
  retailSale: "retail_sale",
};
// ============================================================
// STOP EDITING.
// ============================================================
