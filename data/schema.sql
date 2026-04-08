-- XYON Command Centre — Database Schema
-- Auto-run by server.js on startup

-- Ads snapshot (updated daily)
CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  platform TEXT,              -- 'meta' | 'tiktok' | 'reddit'
  campaign_id TEXT,
  campaign_name TEXT,
  adset_id TEXT,
  adset_name TEXT,
  ad_name TEXT,
  status TEXT,                -- 'ACTIVE' | 'PAUSED' etc
  format TEXT,                -- 'VIDEO' | 'IMAGE' | 'CAROUSEL'
  thumbnail_url TEXT,
  creative_body TEXT,
  headline TEXT,
  updated_at TEXT
);

-- Daily performance snapshots (one row per ad per day)
CREATE TABLE IF NOT EXISTS ad_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id TEXT,
  platform TEXT,
  date TEXT,                  -- YYYY-MM-DD
  spend REAL,
  impressions INTEGER,
  clicks INTEGER,
  ctr REAL,                   -- clicks / impressions
  frequency REAL,             -- meta only
  thumb_stop_rate REAL,       -- tiktok only (2s view / impressions)
  consultations INTEGER,      -- conversion event
  cpm REAL,
  cpp REAL,                   -- cost per consultation
  fatigue_score REAL,         -- computed by analysis/fatigue.js
  UNIQUE(ad_id, date)
);

-- Campaign config (maps campaign → primary conversion metric)
CREATE TABLE IF NOT EXISTS campaign_config (
  campaign_id TEXT PRIMARY KEY,
  platform TEXT,
  primary_metric TEXT,        -- 'consultations' | 'ctr' | 'purchases'
  budget_type TEXT,
  daily_budget REAL
);

-- Inspiration feed (competitor/trending ads)
CREATE TABLE IF NOT EXISTS inspiration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,                -- 'fb_library' | 'tiktok_creative' | 'reddit'
  brand_name TEXT,
  ad_url TEXT,
  thumbnail_url TEXT,
  description TEXT,
  format TEXT,
  hook_type TEXT,             -- extracted concept
  fetched_date TEXT,
  UNIQUE(ad_url)
);

-- Daily suggestions log
CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id TEXT,
  platform TEXT,
  suggestion_type TEXT,       -- 'fatigue_warning' | 'scale' | 'pause' | 'swap'
  suggestion_text TEXT,
  generated_at TEXT
);
