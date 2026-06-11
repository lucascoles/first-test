// ============================================================
// EDIT THIS BLOCK TO MATCH YOUR DATA, THEN STOP.
// ============================================================
// The BigQuery view holding the influencer payout feed.
export const BQ_TABLE = "xyon-growth-production.reporting.rpt_influencer_payout";
// Where the dataset lives. Leave blank ("") for US/EU multi-region
// datasets; otherwise set it, e.g. "australia-southeast1".
export const BQ_LOCATION = "";
// The Google Sheet tab that maps a secret token to a creator. Its
// "Creator Code" column holds the influencer_id, e.g. "INF0130".
export const TOKENS_TAB = "Tokens";
// Column names, exactly as they appear in the view.
// The view is monthly: one row per influencer/event/month.
export const COLUMNS = {
  creatorId: "influencer_id",
  creatorName: "influencer_name",
  date: "month",
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
