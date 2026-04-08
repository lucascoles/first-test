// server.js
// Main Express backend for the Xyon Command Centre.
// Run with: node server.js
// Then open: http://localhost:3000

import 'dotenv/config';
import express from 'express';
import cors    from 'cors';
import path    from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { initSchema }        from './data/schema.js';
import { startScheduler, runDailySync } from './scheduler.js';
import { scoreFatigue }      from './analysis/fatigue.js';
import { benchmarkAllAdSets } from './analysis/benchmark.js';
import { fetchFbAdLibrary }  from './inspiration/fb-ad-library.js';
import { fetchTikTokTrending } from './inspiration/tiktok-creative.js';
import { fetchRedditInsights } from './inspiration/reddit-ads.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 3000;

// ── Database ──────────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'data', 'xyon.db'));
db.pragma('journal_mode = WAL');   // better concurrency
initSchema(db);

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Serve war-room.html as the root
app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'war-room.html'));
});

// ─────────────────────────────────────────────────────────────────────────────
// API Routes — all READ-ONLY
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/summary
// Top-level KPIs for the past 30 days
app.get('/api/summary', (req, res) => {
  const days = parseInt(req.query.days ?? 30);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(m.spend), 0)         AS total_spend,
      COALESCE(SUM(m.consultations), 0) AS total_consultations,
      COALESCE(AVG(m.ctr), 0)           AS avg_ctr,
      COALESCE(AVG(m.frequency), 0)     AS avg_frequency,
      COALESCE(AVG(m.thumb_stop_rate),0) AS avg_thumb_stop,
      COUNT(DISTINCT m.ad_id)           AS active_ads_with_data
    FROM ad_metrics m
    JOIN ads a ON m.ad_id = a.id
    WHERE m.date >= ? AND a.status = 'ACTIVE'
  `).get(sinceStr);

  const activeAds = db.prepare(`
    SELECT COUNT(*) AS count FROM ads WHERE status = 'ACTIVE'
  `).get();

  const byPlatform = db.prepare(`
    SELECT
      m.platform,
      COALESCE(SUM(m.spend), 0)         AS spend,
      COALESCE(SUM(m.consultations), 0) AS consultations,
      COALESCE(AVG(m.ctr), 0)           AS avg_ctr,
      COUNT(DISTINCT m.ad_id)           AS ad_count
    FROM ad_metrics m
    JOIN ads a ON m.ad_id = a.id
    WHERE m.date >= ? AND a.status = 'ACTIVE'
    GROUP BY m.platform
  `).all(sinceStr);

  // Spend over time (last 30 days, one row per day)
  const spendTrend = db.prepare(`
    SELECT date, SUM(spend) AS spend, SUM(consultations) AS consultations
    FROM ad_metrics
    WHERE date >= ?
    GROUP BY date
    ORDER BY date ASC
  `).all(sinceStr);

  res.json({
    totals: {
      ...totals,
      active_ads: activeAds.count
    },
    by_platform: byPlatform,
    spend_trend: spendTrend
  });
});

// GET /api/ads
// All active ads with latest metrics + fatigue score
app.get('/api/ads', (req, res) => {
  const platform  = req.query.platform;   // optional filter
  const sortBy    = req.query.sort ?? 'fatigue_score';
  const order     = req.query.order === 'asc' ? 'ASC' : 'DESC';

  const allowedSorts = ['fatigue_score', 'spend', 'ctr', 'consultations', 'cpp', 'thumb_stop_rate', 'frequency'];
  const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'fatigue_score';

  let query = `
    SELECT
      a.*,
      m.spend, m.impressions, m.clicks, m.ctr, m.frequency,
      m.thumb_stop_rate, m.consultations, m.cpm, m.cpp,
      m.fatigue_score, m.date AS metrics_date,
      cc.primary_metric
    FROM ads a
    LEFT JOIN (
      SELECT ad_id, spend, impressions, clicks, ctr, frequency,
             thumb_stop_rate, consultations, cpm, cpp, fatigue_score, date
      FROM ad_metrics
      WHERE (ad_id, date) IN (
        SELECT ad_id, MAX(date) FROM ad_metrics GROUP BY ad_id
      )
    ) m ON a.id = m.ad_id
    LEFT JOIN campaign_config cc ON a.campaign_id = cc.campaign_id
    WHERE a.status = 'ACTIVE'
  `;

  const params = [];
  if (platform) {
    query += ` AND a.platform = ?`;
    params.push(platform);
  }

  query += ` ORDER BY COALESCE(m.${safeSort}, 0) ${order}`;

  const ads = db.prepare(query).all(...params);
  res.json(ads);
});

// GET /api/ads/:id
// Single ad with 30-day history
app.get('/api/ads/:id', (req, res) => {
  const { id } = req.params;

  const ad = db.prepare(`
    SELECT a.*, cc.primary_metric
    FROM ads a
    LEFT JOIN campaign_config cc ON a.campaign_id = cc.campaign_id
    WHERE a.id = ?
  `).get(id);

  if (!ad) return res.status(404).json({ error: 'Ad not found' });

  const history = db.prepare(`
    SELECT * FROM ad_metrics WHERE ad_id = ? ORDER BY date DESC LIMIT 30
  `).all(id);

  const suggestions = db.prepare(`
    SELECT * FROM suggestions WHERE ad_id = ? ORDER BY generated_at DESC LIMIT 20
  `).all(id);

  // Live fatigue score
  const fatigue = scoreFatigue(db, id, ad.platform);

  res.json({ ...ad, history, suggestions, fatigue });
});

// GET /api/ads/:id/suggestions
app.get('/api/ads/:id/suggestions', (req, res) => {
  const { id } = req.params;
  const suggestions = db.prepare(`
    SELECT * FROM suggestions WHERE ad_id = ? ORDER BY generated_at DESC LIMIT 20
  `).all(id);
  res.json(suggestions);
});

// GET /api/inspiration
// Competitor + trending ad inspiration feed
app.get('/api/inspiration', (req, res) => {
  const source = req.query.source;   // optional: 'fb_library' | 'tiktok_creative' | 'reddit_organic'
  const limit  = parseInt(req.query.limit ?? 50);
  const days   = parseInt(req.query.days ?? 7);

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  let query = `
    SELECT * FROM inspiration
    WHERE fetched_date >= ?
  `;
  const params = [sinceStr];

  if (source) {
    query += ` AND source = ?`;
    params.push(source);
  }

  query += ` ORDER BY fetched_date DESC, id DESC LIMIT ?`;
  params.push(limit);

  const items = db.prepare(query).all(...params);
  res.json(items);
});

// POST /api/inspiration/refresh
// Manually trigger the inspiration scrape
app.post('/api/inspiration/refresh', async (req, res) => {
  res.json({ message: 'Inspiration refresh started' });

  // Run in background
  fetchFbAdLibrary(db).catch(e => console.error('[API] FB Ad Library refresh error:', e));
  fetchTikTokTrending(db).catch(e => console.error('[API] TikTok Creative refresh error:', e));
  fetchRedditInsights(db).catch(e => console.error('[API] Reddit refresh error:', e));
});

// POST /api/sync
// Manually trigger a full data sync (useful for first run / testing)
app.post('/api/sync', async (req, res) => {
  res.json({ message: 'Sync started — check server logs for progress' });
  runDailySync(db).catch(e => console.error('[API] Sync error:', e));
});

// GET /api/campaigns
// List all tracked campaigns with their configured metrics
app.get('/api/campaigns', (req, res) => {
  const campaigns = db.prepare(`
    SELECT cc.*, COUNT(a.id) AS ad_count
    FROM campaign_config cc
    LEFT JOIN ads a ON a.campaign_id = cc.campaign_id AND a.status = 'ACTIVE'
    GROUP BY cc.campaign_id
    ORDER BY cc.platform, cc.campaign_name
  `).all();
  res.json(campaigns);
});

// PUT /api/campaigns/:id/metric
// Let the user update the primary metric for a campaign (e.g. set to 'consultations')
app.put('/api/campaigns/:id/metric', (req, res) => {
  const { id } = req.params;
  const { primary_metric } = req.body;
  const allowed = ['consultations', 'ctr', 'purchases', 'leads', 'installs'];
  if (!allowed.includes(primary_metric)) {
    return res.status(400).json({ error: `primary_metric must be one of: ${allowed.join(', ')}` });
  }
  db.prepare(`UPDATE campaign_config SET primary_metric = ? WHERE campaign_id = ?`).run(primary_metric, id);
  res.json({ ok: true });
});

// GET /api/health
// Quick health check
app.get('/api/health', (req, res) => {
  const adCount = db.prepare('SELECT COUNT(*) as c FROM ads').get().c;
  const metricCount = db.prepare('SELECT COUNT(*) as c FROM ad_metrics').get().c;
  res.json({
    status: 'ok',
    ads: adCount,
    metric_rows: metricCount,
    uptime_seconds: Math.round(process.uptime())
  });
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n`);
  console.log(`  ╔══════════════════════════════════════════╗`);
  console.log(`  ║   XYON Command Centre                    ║`);
  console.log(`  ║   Running at http://localhost:${PORT}       ║`);
  console.log(`  ╠══════════════════════════════════════════╣`);
  console.log(`  ║   First time? Run a manual sync:         ║`);
  console.log(`  ║   curl -X POST localhost:${PORT}/api/sync  ║`);
  console.log(`  ╚══════════════════════════════════════════╝`);
  console.log(`\n`);

  // Start the daily 6am scheduler
  startScheduler(db);
});

export { db };
