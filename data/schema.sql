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

-- ===========================================================================
-- ORGANIC REDDIT LISTENING (read-only social listening — NOT advertising)
-- ===========================================================================

-- Reddit mentions: threads + comments matched by our keyword/intent scan.
-- This is a monitoring surface only — it stores public Reddit content with
-- direct links so a human can review and decide whether/how to engage.
CREATE TABLE IF NOT EXISTS reddit_mentions (
  id            TEXT PRIMARY KEY,   -- reddit fullname, e.g. t3_abc / t1_xyz
  kind          TEXT,               -- 'post' | 'comment'
  subreddit     TEXT,
  author        TEXT,
  title         TEXT,               -- post title (empty for comments)
  body          TEXT,               -- selftext or comment body
  permalink     TEXT,               -- full https://reddit.com/... link
  parent_url    TEXT,               -- for comments: link to the parent thread
  score         INTEGER,            -- upvotes at scan time
  num_comments  INTEGER,            -- post only
  created_utc   INTEGER,            -- unix seconds
  matched_terms TEXT,               -- JSON array of keywords that hit
  intent        TEXT,               -- 'sourcing' | 'comparison' | 'experience' | 'brand' | 'general'
  relevance     INTEGER,            -- 0-100 score (higher = more worth engaging)
  status        TEXT DEFAULT 'new', -- 'new' | 'reviewed' | 'dismissed' | 'engaged'
  first_seen    TEXT,               -- ISO timestamp we first stored it
  last_seen     TEXT,               -- ISO timestamp of most recent scan hit
  draft_text    TEXT,               -- AI-generated draft reply (human reviews before posting)
  draft_model   TEXT,               -- model that produced the draft
  draft_at      TEXT                -- ISO timestamp the draft was generated
);

CREATE INDEX IF NOT EXISTS idx_reddit_mentions_status    ON reddit_mentions(status);
CREATE INDEX IF NOT EXISTS idx_reddit_mentions_intent    ON reddit_mentions(intent);
CREATE INDEX IF NOT EXISTS idx_reddit_mentions_relevance ON reddit_mentions(relevance);

-- Audit log of each scan run.
CREATE TABLE IF NOT EXISTS reddit_scan_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at        TEXT,
  queries_run   INTEGER,
  items_seen    INTEGER,
  new_mentions  INTEGER,
  notes         TEXT
);
