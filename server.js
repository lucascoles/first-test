/**
 * XYON Command Centre — Express Backend.
 *
 * Serves the dashboard, API endpoints, and manages the SQLite database.
 * READ-ONLY: This system never modifies ads on any platform.
 */

import 'dotenv/config';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { scoreFatigue } from './analysis/fatigue.js';
import { benchmarkAd } from './analysis/benchmark.js';
import { suggestForAd } from './analysis/suggestions.js';
import { runFullSync } from './scheduler.js';
import { startScheduler } from './scheduler.js';
import { scanReddit } from './scanners/reddit-listen.js';
import { draftReply } from './analysis/reddit-draft.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------
// DB_PATH lets a hosted deploy point the SQLite file at a persistent disk
// (e.g. /var/data/xyon.db) so scanned data survives redeploys.
const dbPath = process.env.DB_PATH || join(__dirname, 'data', 'xyon.db');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema
const schema = readFileSync(join(__dirname, 'data', 'schema.sql'), 'utf8');
db.exec(schema);

// Lightweight migrations for DBs created before newer columns existed.
function ensureColumn(table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
for (const [col, type] of [['draft_text', 'TEXT'], ['draft_model', 'TEXT'], ['draft_at', 'TEXT']]) {
  ensureColumn('reddit_mentions', col, type);
}

console.log('[db] Schema initialized at', dbPath);

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

// Serve war-room.html at root
app.get('/', (_req, res) => {
  res.sendFile(join(__dirname, 'war-room.html'));
});

// Serve static files from project root (for any CSS/JS assets)
app.use(express.static(__dirname));

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/summary
 * KPIs: total spend (30d), consultations, avg CTR, active ads count, avg frequency (meta)
 */
app.get('/api/summary', (_req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const metrics = db.prepare(`
    SELECT
      COALESCE(SUM(spend), 0)          as totalSpend,
      COALESCE(SUM(consultations), 0)  as totalConsultations,
      COALESCE(AVG(ctr), 0)            as avgCtr,
      COALESCE(AVG(cpm), 0)            as avgCpm
    FROM ad_metrics
    WHERE date >= ?
  `).get(thirtyDaysAgo);

  const metaFreq = db.prepare(`
    SELECT COALESCE(AVG(frequency), 0) as avgFrequency
    FROM ad_metrics
    WHERE platform = 'meta' AND date >= ?
  `).get(thirtyDaysAgo);

  const activeCount = db.prepare(
    `SELECT COUNT(*) as count FROM ads WHERE status = 'ACTIVE'`
  ).get();

  const platformBreakdown = db.prepare(`
    SELECT
      platform,
      COALESCE(SUM(spend), 0) as spend,
      COALESCE(SUM(consultations), 0) as consultations,
      COUNT(DISTINCT ad_id) as adCount
    FROM ad_metrics
    WHERE date >= ?
    GROUP BY platform
  `).all(thirtyDaysAgo);

  res.json({
    totalSpend: parseFloat((metrics.totalSpend || 0).toFixed(2)),
    totalConsultations: metrics.totalConsultations || 0,
    avgCtr: parseFloat((metrics.avgCtr || 0).toFixed(2)),
    avgCpm: parseFloat((metrics.avgCpm || 0).toFixed(2)),
    avgFrequency: parseFloat((metaFreq.avgFrequency || 0).toFixed(2)),
    activeAds: activeCount.count,
    platformBreakdown
  });
});

/**
 * GET /api/ads
 * All active ads with latest metrics + fatigue score.
 * Query params: ?platform=meta|tiktok|reddit  &status=ACTIVE|PAUSED
 */
app.get('/api/ads', (req, res) => {
  const { platform, status } = req.query;

  let where = '1=1';
  const params = [];

  if (platform) {
    where += ' AND a.platform = ?';
    params.push(platform);
  }
  if (status) {
    where += ' AND a.status = ?';
    params.push(status);
  }

  const ads = db.prepare(`
    SELECT
      a.*,
      m.spend        as latest_spend,
      m.impressions  as latest_impressions,
      m.clicks       as latest_clicks,
      m.ctr          as latest_ctr,
      m.frequency    as latest_frequency,
      m.thumb_stop_rate as latest_thumb_stop,
      m.consultations as latest_consultations,
      m.cpm          as latest_cpm,
      m.cpp          as latest_cpp,
      m.fatigue_score as latest_fatigue
    FROM ads a
    LEFT JOIN ad_metrics m ON m.ad_id = a.id AND m.date = (
      SELECT MAX(date) FROM ad_metrics WHERE ad_id = a.id
    )
    WHERE ${where}
    ORDER BY m.spend DESC
  `).all(...params);

  // Compute 7-day aggregates for each ad
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const enriched = ads.map(ad => {
    const agg = db.prepare(`
      SELECT
        COALESCE(SUM(spend), 0)         as spend_7d,
        COALESCE(SUM(impressions), 0)   as impressions_7d,
        COALESCE(SUM(clicks), 0)        as clicks_7d,
        COALESCE(SUM(consultations), 0) as consultations_7d,
        COALESCE(AVG(ctr), 0)           as avg_ctr_7d,
        COALESCE(AVG(frequency), 0)     as avg_frequency_7d,
        COALESCE(AVG(thumb_stop_rate), 0) as avg_thumb_stop_7d,
        COALESCE(AVG(cpp), 0)           as avg_cpp_7d
      FROM ad_metrics WHERE ad_id = ? AND date >= ?
    `).get(ad.id, sevenDaysAgo);

    return { ...ad, ...agg };
  });

  res.json(enriched);
});

/**
 * GET /api/ads/:id
 * Single ad detail with 30-day history.
 */
app.get('/api/ads/:id', (req, res) => {
  const ad = db.prepare('SELECT * FROM ads WHERE id = ?').get(req.params.id);
  if (!ad) return res.status(404).json({ error: 'Ad not found' });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const history = db.prepare(`
    SELECT * FROM ad_metrics WHERE ad_id = ? AND date >= ? ORDER BY date ASC
  `).all(req.params.id, thirtyDaysAgo);

  const today = new Date().toISOString().slice(0, 10);
  const fatigue = scoreFatigue(db, ad.id, ad.platform, today);
  const benchmark = benchmarkAd(db, ad.id, ad.platform);

  // Get campaign config if exists
  const config = db.prepare(
    'SELECT * FROM campaign_config WHERE campaign_id = ?'
  ).get(ad.campaign_id);

  res.json({ ad, history, fatigue, benchmark, campaignConfig: config || null });
});

/**
 * GET /api/ads/:id/suggestions
 * Suggestions for a specific ad.
 */
app.get('/api/ads/:id/suggestions', (req, res) => {
  const ad = db.prepare(
    'SELECT id, platform, ad_name, adset_id FROM ads WHERE id = ?'
  ).get(req.params.id);

  if (!ad) return res.status(404).json({ error: 'Ad not found' });

  // Get stored suggestions
  const stored = db.prepare(`
    SELECT * FROM suggestions WHERE ad_id = ? ORDER BY generated_at DESC LIMIT 20
  `).all(req.params.id);

  // Also compute live suggestions
  const live = suggestForAd(db, ad);

  res.json({ stored, live });
});

/**
 * GET /api/inspiration
 * Today's inspiration feed.
 * Query params: ?source=fb_library|tiktok_creative|reddit_organic
 */
app.get('/api/inspiration', (req, res) => {
  const { source } = req.query;

  let query = 'SELECT * FROM inspiration';
  const params = [];

  if (source) {
    query += ' WHERE source = ?';
    params.push(source);
  }

  query += ' ORDER BY fetched_date DESC LIMIT 50';

  const items = db.prepare(query).all(...params);
  res.json(items);
});

/**
 * GET /api/inspiration/refresh
 * Manually trigger a competitor ad fetch.
 */
app.get('/api/inspiration/refresh', async (_req, res) => {
  try {
    const { fetchFbAdLibrary } = await import('./inspiration/fb-ad-library.js');
    const { fetchTikTokCreative } = await import('./inspiration/tiktok-creative.js');
    const { fetchRedditInspiration } = await import('./inspiration/reddit-ads.js');

    await fetchFbAdLibrary(db);
    await fetchTikTokCreative(db);
    await fetchRedditInspiration(db);

    res.json({ status: 'ok', message: 'Inspiration feed refreshed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sync
 * Manually trigger a full scrape + analysis pipeline.
 */
app.post('/api/sync', async (_req, res) => {
  try {
    await runFullSync(db);
    res.json({ status: 'ok', message: 'Full sync complete.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Also support GET for easy curl testing
app.get('/api/sync', async (_req, res) => {
  try {
    await runFullSync(db);
    res.json({ status: 'ok', message: 'Full sync complete.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Organic Reddit Listening (read-only social listening)
// ---------------------------------------------------------------------------

/** Serve the Reddit Radar dashboard page. */
app.get('/reddit', (_req, res) => {
  res.sendFile(join(__dirname, 'reddit-radar.html'));
});

/**
 * GET /api/reddit/mentions
 * Flagged threads & comments for manual review.
 * Query params:
 *   ?status=new|reviewed|dismissed|engaged   (default: excludes 'dismissed')
 *   ?intent=sourcing|comparison|experience|brand|general
 *   ?subreddit=tressless
 *   ?kind=post|comment
 *   ?min=<relevance>   (default 0)
 *   ?limit=<n>         (default 200)
 */
app.get('/api/reddit/mentions', (req, res) => {
  const { status, intent, subreddit, kind } = req.query;
  const min = parseInt(req.query.min, 10) || 0;
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);

  let where = 'relevance >= ?';
  const params = [min];

  if (status) { where += ' AND status = ?'; params.push(status); }
  else { where += " AND status != 'dismissed'"; }
  if (intent) { where += ' AND intent = ?'; params.push(intent); }
  if (subreddit) { where += ' AND subreddit = ?'; params.push(subreddit); }
  if (kind) { where += ' AND kind = ?'; params.push(kind); }

  const rows = db.prepare(`
    SELECT * FROM reddit_mentions
    WHERE ${where}
    ORDER BY relevance DESC, created_utc DESC
    LIMIT ?
  `).all(...params, limit);

  const mentions = rows.map((r) => ({
    ...r,
    matched_terms: JSON.parse(r.matched_terms || '[]'),
  }));

  res.json(mentions);
});

/**
 * GET /api/reddit/summary
 * Counts for the dashboard header + last scan info.
 */
app.get('/api/reddit/summary', (_req, res) => {
  const byIntent = db.prepare(`
    SELECT intent, COUNT(*) as count FROM reddit_mentions
    WHERE status != 'dismissed' GROUP BY intent
  `).all();

  const newCount = db.prepare(
    "SELECT COUNT(*) as c FROM reddit_mentions WHERE status = 'new'"
  ).get().c;

  const sourcingNew = db.prepare(
    "SELECT COUNT(*) as c FROM reddit_mentions WHERE status = 'new' AND intent = 'sourcing'"
  ).get().c;

  const lastScan = db.prepare(
    'SELECT * FROM reddit_scan_log ORDER BY id DESC LIMIT 1'
  ).get();

  res.json({ newCount, sourcingNew, byIntent, lastScan: lastScan || null });
});

/**
 * POST /api/reddit/mentions/:id/status
 * Body: { status: 'reviewed' | 'dismissed' | 'engaged' | 'new' }
 * Lets you triage the queue without touching Reddit itself.
 */
app.post('/api/reddit/mentions/:id/status', (req, res) => {
  const { status } = req.body || {};
  const allowed = ['new', 'reviewed', 'dismissed', 'engaged'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
  }
  const info = db.prepare('UPDATE reddit_mentions SET status = ? WHERE id = ?')
    .run(status, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Mention not found' });
  res.json({ status: 'ok' });
});

/**
 * POST /api/reddit/scan  (also GET for easy curl testing)
 * Manually trigger a Reddit listening pass.
 */
async function handleRedditScan(_req, res) {
  try {
    const result = await scanReddit(db);
    res.json({ status: 'ok', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
app.post('/api/reddit/scan', handleRedditScan);
app.get('/api/reddit/scan', handleRedditScan);

/**
 * POST /api/reddit/mentions/:id/draft
 * Generate (or regenerate) a disclosed AI draft reply for a mention and store it.
 * Returns { draft, model }. Never posts to Reddit.
 */
app.post('/api/reddit/mentions/:id/draft', async (req, res) => {
  const row = db.prepare('SELECT * FROM reddit_mentions WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Mention not found' });

  const mention = { ...row, matched_terms: JSON.parse(row.matched_terms || '[]') };
  const result = await draftReply(mention);

  if (!result.ok) return res.status(503).json({ error: result.reason });

  db.prepare(`
    UPDATE reddit_mentions
    SET draft_text = ?, draft_model = ?, draft_at = ?
    WHERE id = ?
  `).run(result.draft, result.model, new Date().toISOString(), req.params.id);

  res.json({ draft: result.draft, model: result.model });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n  XYON Command Centre running at http://localhost:${PORT}`);
  console.log(`  Dashboard:    http://localhost:${PORT}`);
  console.log(`  Reddit Radar: http://localhost:${PORT}/reddit`);
  console.log(`  API:          http://localhost:${PORT}/api/summary`);
  console.log(`  Manual sync:  curl -X POST http://localhost:${PORT}/api/sync`);
  console.log(`  Reddit scan:  curl -X POST http://localhost:${PORT}/api/reddit/scan\n`);
});

// Start the daily scheduler
startScheduler(db);
