// analysis/suggestions.js
// Rules-based suggestion engine.
// Reads from the database, writes suggestions back to the suggestions table.
// NEVER touches or modifies actual ad accounts.

import { scoreFatigue, fatigueLabel } from './fatigue.js';
import { benchmarkAllAdSets } from './benchmark.js';

const META_SWAP_PLACEHOLDER = `
  Meta Ad Swap Framework: to be wired in once you share your framework rules.
  For now, a swap is recommended when fatigue score >= 81.
`;

export function generateSuggestions(db) {
  const today = new Date().toISOString().slice(0, 10);
  const ads   = db.prepare(`SELECT * FROM ads WHERE status = 'ACTIVE'`).all();

  // Get benchmark scores for all ad sets
  const benchmarks = benchmarkAllAdSets(db);

  // Delete today's suggestions before regenerating (idempotent)
  db.prepare(`DELETE FROM suggestions WHERE generated_at LIKE ?`).run(`${today}%`);

  const insertSuggestion = db.prepare(`
    INSERT INTO suggestions (ad_id, platform, suggestion_type, suggestion_text, generated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  let count = 0;

  for (const ad of ads) {
    const { score, signals, label } = scoreFatigue(db, ad.id, ad.platform, today);
    const bench = benchmarks[ad.id];

    // Get today's metrics (or last available)
    const metrics = db.prepare(`
      SELECT * FROM ad_metrics WHERE ad_id = ? ORDER BY date DESC LIMIT 1
    `).get(ad.id);

    if (!metrics) continue;

    const suggestions = buildSuggestions(ad, metrics, score, label, signals, bench);

    for (const s of suggestions) {
      insertSuggestion.run(ad.id, ad.platform, s.type, s.text, new Date().toISOString());
      count++;
    }
  }

  console.log(`[Suggestions] Generated ${count} suggestions for ${ads.length} active ads`);
  return count;
}

function buildSuggestions(ad, metrics, fatigueScore, fatigueLabel, signals, bench) {
  const suggestions = [];
  const name = ad.ad_name ?? ad.id;
  const spend = metrics.spend ?? 0;
  const consultations = metrics.consultations ?? 0;
  const ctr = metrics.ctr ?? 0;
  const cpp = metrics.cpp ?? 0;
  const frequency = metrics.frequency ?? 0;
  const thumbStop = metrics.thumb_stop_rate ?? 0;

  // ── Fatigue signals ────────────────────────────────────────────────────────
  if (fatigueScore >= 81) {
    if (ad.platform === 'meta') {
      suggestions.push({
        type: 'swap',
        text: `🔴 Creative fatigue CRITICAL on "${name}". Frequency is ${frequency.toFixed(1)}x — audience has seen this ad too many times. ${META_SWAP_PLACEHOLDER.trim()}`
      });
    } else {
      suggestions.push({
        type: 'swap',
        text: `🔴 Creative fatigue CRITICAL on "${name}". CTR dropped ${Math.abs(signals.ctr_decay ?? 0)}% recently. Swap or pause this creative immediately.`
      });
    }
  } else if (fatigueScore >= 61) {
    suggestions.push({
      type: 'fatigue_warning',
      text: `🟠 Creative fatigue WARNING on "${name}". Performance declining — CTR decay: ${Math.abs(signals.ctr_decay ?? 0)}%. Consider refreshing the hook or headline.`
    });
  } else if (fatigueScore >= 31) {
    suggestions.push({
      type: 'fatigue_watch',
      text: `🟡 Watch: "${name}" showing early fatigue signals (score ${fatigueScore}/100). Monitor closely over the next 3 days.`
    });
  }

  // ── TikTok thumb stop ──────────────────────────────────────────────────────
  if (ad.platform === 'tiktok' && thumbStop > 0 && thumbStop < 0.25) {
    suggestions.push({
      type: 'thumb_stop_low',
      text: `📱 Thumb stop rate is low on "${name}" (${(thumbStop * 100).toFixed(1)}% — target: 25%+). The first 2 seconds are not grabbing attention. Test a stronger opening hook, a bold visual, or add text overlay in the first frame.`
    });
  }

  // ── Spend with zero conversions ────────────────────────────────────────────
  if (spend > 200 && consultations === 0) {
    suggestions.push({
      type: 'pause',
      text: `⚠️ "${name}" has spent $${spend.toFixed(0)} with 0 consultations booked. Check if the consultation pixel is firing correctly. If confirmed, consider pausing this ad.`
    });
  }

  // ── High CTR but low conversions ───────────────────────────────────────────
  if (ctr > 2 && consultations === 0 && spend > 100) {
    suggestions.push({
      type: 'landing_page',
      text: `🔍 "${name}" has strong CTR (${ctr.toFixed(2)}%) but no consultations. People are clicking but not booking. Review the landing page experience — the ad promise may not match the page.`
    });
  }

  // ── Ad set benchmark low performer ────────────────────────────────────────
  if (bench && bench.benchmark_score < 60 && bench.note !== 'solo_ad') {
    suggestions.push({
      type: 'benchmark_low',
      text: `📊 "${name}" is underperforming vs its ad set peers (score: ${bench.benchmark_score}/100, vs peer CTR avg: ${(bench.peer_ctr_avg * 100).toFixed(2)}%). Consider replacing this creative with a variant or pausing it.`
    });
  }

  // ── Strong performer — scale suggestion ────────────────────────────────────
  if (bench && bench.benchmark_score > 130 && fatigueScore < 40 && spend > 50) {
    suggestions.push({
      type: 'scale',
      text: `✅ "${name}" is a top performer in its ad set (benchmark score: ${bench.benchmark_score}/100). Low fatigue (${fatigueScore}/100). Consider increasing budget by 20–30%.`
    });
  }

  return suggestions;
}
