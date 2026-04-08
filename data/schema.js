// data/schema.js
// Sets up all SQLite tables on first run.
// Called once when server.js starts.

export function initSchema(db) {
  db.exec(`
    -- --------------------------------------------------------
    -- ads: one row per ad (upserted daily)
    -- --------------------------------------------------------
    CREATE TABLE IF NOT EXISTS ads (
      id           TEXT PRIMARY KEY,
      platform     TEXT NOT NULL,       -- 'meta' | 'tiktok' | 'reddit'
      campaign_id  TEXT,
      campaign_name TEXT,
      adset_id     TEXT,
      adset_name   TEXT,
      ad_name      TEXT,
      status       TEXT,                -- 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
      format       TEXT,                -- 'VIDEO' | 'IMAGE' | 'CAROUSEL'
      thumbnail_url TEXT,
      creative_body TEXT,
      headline     TEXT,
      updated_at   TEXT
    );

    -- --------------------------------------------------------
    -- ad_metrics: one row per ad per day
    -- --------------------------------------------------------
    CREATE TABLE IF NOT EXISTS ad_metrics (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      ad_id            TEXT NOT NULL,
      platform         TEXT NOT NULL,
      date             TEXT NOT NULL,   -- YYYY-MM-DD
      spend            REAL DEFAULT 0,
      impressions      INTEGER DEFAULT 0,
      clicks           INTEGER DEFAULT 0,
      ctr              REAL DEFAULT 0,  -- clicks / impressions * 100
      frequency        REAL DEFAULT 0,  -- Meta only
      thumb_stop_rate  REAL DEFAULT 0,  -- TikTok only (2s views / impressions)
      consultations    INTEGER DEFAULT 0,
      cpm              REAL DEFAULT 0,
      cpp              REAL DEFAULT 0,  -- cost per consultation
      fatigue_score    REAL DEFAULT 0,  -- 0-100, computed by analysis/fatigue.js
      UNIQUE(ad_id, date)
    );

    -- --------------------------------------------------------
    -- campaign_config: maps each campaign to its primary metric
    -- --------------------------------------------------------
    CREATE TABLE IF NOT EXISTS campaign_config (
      campaign_id    TEXT PRIMARY KEY,
      platform       TEXT NOT NULL,
      campaign_name  TEXT,
      primary_metric TEXT DEFAULT 'consultations',
      budget_type    TEXT,
      daily_budget   REAL DEFAULT 0
    );

    -- --------------------------------------------------------
    -- inspiration: competitor / trending ads feed
    -- --------------------------------------------------------
    CREATE TABLE IF NOT EXISTS inspiration (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      source        TEXT NOT NULL,      -- 'fb_library' | 'tiktok_creative' | 'reddit_organic'
      brand_name    TEXT,
      ad_url        TEXT,
      thumbnail_url TEXT,
      description   TEXT,
      format        TEXT,
      hook_type     TEXT,
      fetched_date  TEXT NOT NULL,
      UNIQUE(ad_url)
    );

    -- --------------------------------------------------------
    -- suggestions: daily recommendations per ad
    -- --------------------------------------------------------
    CREATE TABLE IF NOT EXISTS suggestions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      ad_id            TEXT NOT NULL,
      platform         TEXT NOT NULL,
      suggestion_type  TEXT NOT NULL,   -- 'fatigue_warning' | 'scale' | 'pause' | 'swap' | 'benchmark_low'
      suggestion_text  TEXT NOT NULL,
      generated_at     TEXT NOT NULL
    );

    -- --------------------------------------------------------
    -- indexes for common queries
    -- --------------------------------------------------------
    CREATE INDEX IF NOT EXISTS idx_metrics_ad_date  ON ad_metrics(ad_id, date);
    CREATE INDEX IF NOT EXISTS idx_metrics_platform ON ad_metrics(platform, date);
    CREATE INDEX IF NOT EXISTS idx_ads_platform     ON ads(platform, status);
    CREATE INDEX IF NOT EXISTS idx_inspiration_date ON inspiration(fetched_date);
    CREATE INDEX IF NOT EXISTS idx_suggestions_ad   ON suggestions(ad_id, generated_at);
  `);
}
