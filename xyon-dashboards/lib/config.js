// ============================================================
// EDIT THIS BLOCK TO MATCH YOUR SHEETS, THEN STOP.
// ============================================================
// The tab (inside the DATA_SHEET_ID spreadsheet) holding the payout
// feed. Create it with Extract from the connected rpt_influencer_payout
// tab and rename it to "data".
export const DATA_TAB = "data";
// The tab (inside the TOKENS_SHEET_ID spreadsheet) that maps a secret
// token to a creator. Its "Creator Code" column holds the influencer_id
// from the feed, e.g. "INF0130".
export const TOKENS_TAB = "Tokens";
// Column names, exactly as they appear in the feed's header row.
// The feed is monthly: one row per influencer/event/month.
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
