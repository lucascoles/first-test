/**
 * XYON Command Centre — Express Backend.
 *
 * Serves the dashboard, API endpoints, and manages the SQLite database.
 * READ-ONLY: This system never modifies ads on any platform.
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------
const dbPath = join(__dirname, 'data', 'xyon.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema
const schema = readFileSync(join(__dirname, 'data', 'schema.sql'), 'utf8');
db.exec(schema);
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
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n  XYON Command Centre running at http://localhost:${PORT}`);
  console.log(`  Dashboard:  http://localhost:${PORT}`);
  console.log(`  API:        http://localhost:${PORT}/api/summary`);
  console.log(`  Manual sync: curl -X POST http://localhost:${PORT}/api/sync\n`);
});

// Start the daily scheduler
startScheduler(db);
