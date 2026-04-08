/**
 * Rules-Based Suggestions Engine.
 *
 * Generates actionable text suggestions per ad based on:
 *   - Fatigue scores
 *   - Benchmark scores
 *   - Raw metric thresholds
 *
 * Suggestion types: 'fatigue_warning' | 'scale' | 'pause' | 'swap'
 */

import { scoreFatigue } from './fatigue.js';
import { benchmarkAd } from './benchmark.js';

/**
 * Get the last 7-day averages for an ad.
 */
function getRecentMetrics(db, adId) {
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  return db.prepare(`
    SELECT
      AVG(ctr) as avgCtr,
      AVG(cpm) as avgCpm,
      AVG(cpp) as avgCpp,
      AVG(frequency) as avgFrequency,
      AVG(thumb_stop_rate) as avgThumbStop,
      SUM(spend) as totalSpend,
      SUM(consultations) as totalConsultations
    FROM ad_metrics
    WHERE ad_id = ? AND date >= ? AND date <= ?
  `).get(adId, start, end) || {};
}

/**
 * Get ad set average metrics for context.
 */
function getAdsetAvg(db, adsetId, platform) {
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const peerIds = db.prepare(
    'SELECT id FROM ads WHERE adset_id = ? AND platform = ? AND status = ?'
  ).all(adsetId, platform, 'ACTIVE').map(r => r.id);

  if (peerIds.length === 0) return null;

  const placeholders = peerIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT AVG(ctr) as avgCtr, AVG(cpp) as avgCpp
    FROM ad_metrics
    WHERE ad_id IN (${placeholders}) AND date >= ? AND date <= ?
  `).get(...peerIds, start, end);
}

/**
 * Generate suggestions for a single ad.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ id: string, platform: string, ad_name: string, adset_id: string }} ad
 * @returns {Array<{ type: string, text: string }>}
 */
export function suggestForAd(db, ad) {
  const today = new Date().toISOString().slice(0, 10);
  const suggestions = [];
  const metrics = getRecentMetrics(db, ad.id);
  const { score: fatigueScore, signals } = scoreFatigue(db, ad.id, ad.platform, today);
  const adsetAvg = getAdsetAvg(db, ad.adset_id, ad.platform);

  // --- Universal: high spend with zero conversions ---
  if ((metrics.totalSpend || 0) > 500 && (metrics.totalConsultations || 0) === 0) {
    suggestions.push({
      type: 'pause',
      text: `High spend ($${(metrics.totalSpend || 0).toFixed(0)}) with zero conversions in the last 7 days. Pause recommended.`
    });
  }

  // --- Meta-specific rules ---
  if (ad.platform === 'meta') {
    if (fatigueScore >= 81) {
      const freq = (metrics.avgFrequency || 0).toFixed(1);
      suggestions.push({
        type: 'swap',
        text: `Creative fatigue critical on "${ad.ad_name}". Frequency: ${freq}. Recommend swap creative or pause.`
      });
    } else if (fatigueScore >= 61) {
      const ctrDrop = signals?.ctrDecay
        ? Math.round(((signals.ctrDecay.priorCtr - signals.ctrDecay.recentCtr) / (signals.ctrDecay.priorCtr || 1)) * 100)
        : 0;
      suggestions.push({
        type: 'fatigue_warning',
        text: `Creative fatigue warning. CTR dropped ${ctrDrop}% this week. Consider refreshing hook.`
      });
    }

    if (adsetAvg && adsetAvg.avgCtr > 0 && (metrics.avgCtr || 0) < adsetAvg.avgCtr * 0.7) {
      const pct = Math.round((1 - (metrics.avgCtr || 0) / adsetAvg.avgCtr) * 100);
      suggestions.push({
        type: 'fatigue_warning',
        text: `CTR underperforming vs ad set average by ${pct}%. Test new headline.`
      });
    }

    if (adsetAvg && adsetAvg.avgCpp > 0 && (metrics.avgCpp || 0) > 0 && (metrics.avgCpp || 0) < adsetAvg.avgCpp * 0.8) {
      suggestions.push({
        type: 'scale',
        text: `Strong performer — CPP is ${Math.round((1 - (metrics.avgCpp || 0) / adsetAvg.avgCpp) * 100)}% below ad set average. Consider increasing budget by 20%.`
      });
    }
  }

  // --- TikTok-specific rules ---
  if (ad.platform === 'tiktok') {
    if ((metrics.avgThumbStop || 0) < 0.25 && (metrics.avgThumbStop || 0) > 0) {
      suggestions.push({
        type: 'fatigue_warning',
        text: `Thumb stop rate low (${((metrics.avgThumbStop || 0) * 100).toFixed(1)}%). First 2 seconds need stronger hook.`
      });
    }

    const benchmark = benchmarkAd(db, ad.id, 'tiktok');
    if (benchmark.score < 60) {
      suggestions.push({
        type: 'fatigue_warning',
        text: `Underperforming vs ad set peers (benchmark score: ${benchmark.score}). Review creative.`
      });
    }

    if (fatigueScore >= 61) {
      suggestions.push({
        type: 'fatigue_warning',
        text: `TikTok fatigue score ${fatigueScore}/100. Thumb stop and CTR trending down. Consider new hook or creative.`
      });
    }
  }

  // --- Reddit-specific rules ---
  if (ad.platform === 'reddit') {
    const benchmark = benchmarkAd(db, ad.id, 'reddit');
    if (benchmark.score < 60) {
      suggestions.push({
        type: 'fatigue_warning',
        text: `Reddit ad underperforming vs peers (benchmark: ${benchmark.score}). Test new copy or targeting.`
      });
    }

    if (fatigueScore >= 61) {
      suggestions.push({
        type: 'fatigue_warning',
        text: `Reddit fatigue score ${fatigueScore}/100. Performance declining vs ad set average.`
      });
    }
  }

  // --- If nothing flagged, healthy ---
  if (suggestions.length === 0 && fatigueScore <= 30) {
    suggestions.push({
      type: 'scale',
      text: `Ad is performing well (fatigue score: ${fatigueScore}/100). No action needed.`
    });
  }

  return suggestions;
}

/**
 * Generate and persist suggestions for all active ads.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function generateSuggestions(db) {
  const now = new Date().toISOString();
  const activeAds = db.prepare(
    `SELECT id, platform, ad_name, adset_id FROM ads WHERE status = 'ACTIVE'`
  ).all();

  console.log(`[suggestions] Generating suggestions for ${activeAds.length} active ads...`);

  const insert = db.prepare(`
    INSERT INTO suggestions (ad_id, platform, suggestion_type, suggestion_text, generated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  let total = 0;
  for (const ad of activeAds) {
    const items = suggestForAd(db, ad);
    for (const s of items) {
      insert.run(ad.id, ad.platform, s.type, s.text, now);
      total++;
    }
  }

  console.log(`[suggestions] Generated ${total} suggestions.`);
}
