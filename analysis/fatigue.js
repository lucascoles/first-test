// analysis/fatigue.js
// Calculates a creative fatigue score (0–100) for each ad.
//
// Score bands:
//   0–30  → Healthy    (green)
//   31–60 → Watch      (yellow)
//   61–80 → Warning    (orange) — suggest creative refresh
//   81–100 → Critical  (red)   — suggest swap or pause
//
// Each platform uses different signals since the available metrics differ.

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Calculate % change between two values (positive = got worse / higher cost or lower rate)
function pctChange(newer, older) {
  if (!older || older === 0) return 0;
  return (newer - older) / older;
}

// ── Per-platform fatigue calculators ─────────────────────────────────────────

function calcMetaFatigue(last7, prev7) {
  if (!last7.length) return { score: 0, signals: {} };

  const lastFreq  = avg(last7.map(r => r.frequency));
  const prevFreq  = avg(prev7.map(r => r.frequency));
  const lastCtr   = avg(last7.map(r => r.ctr));
  const prevCtr   = avg(prev7.map(r => r.ctr));
  const lastCpm   = avg(last7.map(r => r.cpm));
  const prevCpm   = avg(prev7.map(r => r.cpm));

  // Signal 1: Frequency (40% weight)
  // <2.5 = fine, 3–4 = building, 5+ = critical
  const freqSignal = clamp((lastFreq - 2.5) / 4.5, 0, 1) * 100;

  // Signal 2: CTR decay (35% weight)
  // Negative pctChange = CTR dropped = bad
  const ctrDecay = prev7.length > 0 ? clamp(-pctChange(lastCtr, prevCtr) * 200, 0, 100) : 0;

  // Signal 3: CPM inflation (25% weight)
  // Positive pctChange = CPM rose = bad
  const cpmInflation = prev7.length > 0 ? clamp(pctChange(lastCpm, prevCpm) * 200, 0, 100) : 0;

  const score = (freqSignal * 0.40) + (ctrDecay * 0.35) + (cpmInflation * 0.25);

  return {
    score: Math.round(clamp(score, 0, 100)),
    signals: {
      frequency:     Math.round(lastFreq * 100) / 100,
      ctr_last7:     Math.round(lastCtr * 1000) / 1000,
      ctr_prev7:     Math.round(prevCtr * 1000) / 1000,
      cpm_last7:     Math.round(lastCpm * 100) / 100,
      cpm_prev7:     Math.round(prevCpm * 100) / 100,
      freq_signal:   Math.round(freqSignal),
      ctr_decay:     Math.round(ctrDecay),
      cpm_inflation: Math.round(cpmInflation)
    }
  };
}

function calcTikTokFatigue(last7, prev7) {
  if (!last7.length) return { score: 0, signals: {} };

  const lastThumb = avg(last7.map(r => r.thumb_stop_rate));
  const prevThumb = avg(prev7.map(r => r.thumb_stop_rate));
  const lastCtr   = avg(last7.map(r => r.ctr));
  const prevCtr   = avg(prev7.map(r => r.ctr));
  const lastCpp   = avg(last7.map(r => r.cpp));
  const prevCpp   = avg(prev7.map(r => r.cpp));

  // Signal 1: Thumb stop decay (40% weight)
  const thumbDecay = prev7.length > 0 ? clamp(-pctChange(lastThumb, prevThumb) * 200, 0, 100) : 0;

  // Signal 2: CTR decay (30% weight)
  const ctrDecay = prev7.length > 0 ? clamp(-pctChange(lastCtr, prevCtr) * 200, 0, 100) : 0;

  // Signal 3: CPP inflation (30% weight)
  const cppInflation = prev7.length > 0 ? clamp(pctChange(lastCpp, prevCpp) * 200, 0, 100) : 0;

  const score = (thumbDecay * 0.40) + (ctrDecay * 0.30) + (cppInflation * 0.30);

  return {
    score: Math.round(clamp(score, 0, 100)),
    signals: {
      thumb_stop_last7:  Math.round(lastThumb * 1000) / 1000,
      thumb_stop_prev7:  Math.round(prevThumb * 1000) / 1000,
      ctr_last7:         Math.round(lastCtr * 1000) / 1000,
      ctr_prev7:         Math.round(prevCtr * 1000) / 1000,
      cpp_last7:         Math.round(lastCpp * 100) / 100,
      cpp_prev7:         Math.round(prevCpp * 100) / 100,
      thumb_decay:       Math.round(thumbDecay),
      ctr_decay:         Math.round(ctrDecay),
      cpp_inflation:     Math.round(cppInflation)
    }
  };
}

function calcRedditFatigue(last7, prev7) {
  // Reddit has no frequency; use CTR + CPP decay only
  if (!last7.length) return { score: 0, signals: {} };

  const lastCtr = avg(last7.map(r => r.ctr));
  const prevCtr = avg(prev7.map(r => r.ctr));
  const lastCpp = avg(last7.map(r => r.cpp));
  const prevCpp = avg(prev7.map(r => r.cpp));

  const ctrDecay     = prev7.length > 0 ? clamp(-pctChange(lastCtr, prevCtr) * 200, 0, 100) : 0;
  const cppInflation = prev7.length > 0 ? clamp(pctChange(lastCpp, prevCpp) * 200, 0, 100) : 0;

  const score = (ctrDecay * 0.50) + (cppInflation * 0.50);

  return {
    score: Math.round(clamp(score, 0, 100)),
    signals: {
      ctr_last7:     Math.round(lastCtr * 1000) / 1000,
      ctr_prev7:     Math.round(prevCtr * 1000) / 1000,
      cpp_last7:     Math.round(lastCpp * 100) / 100,
      cpp_prev7:     Math.round(prevCpp * 100) / 100,
      ctr_decay:     Math.round(ctrDecay),
      cpp_inflation: Math.round(cppInflation)
    }
  };
}

// ── Main exports ──────────────────────────────────────────────────────────────

export function fatigueLabel(score) {
  if (score >= 81) return 'critical';
  if (score >= 61) return 'warning';
  if (score >= 31) return 'watch';
  return 'healthy';
}

export function scoreFatigue(db, adId, platform, asOfDate) {
  const d = asOfDate ?? new Date().toISOString().slice(0, 10);

  const rows = db.prepare(`
    SELECT * FROM ad_metrics
    WHERE ad_id = ? AND date <= ?
    ORDER BY date DESC
    LIMIT 14
  `).all(adId, d);

  if (!rows.length) return { score: 0, label: 'healthy', signals: {} };

  const last7 = rows.slice(0, 7);
  const prev7 = rows.slice(7, 14);

  let result;
  if (platform === 'meta')    result = calcMetaFatigue(last7, prev7);
  else if (platform === 'tiktok') result = calcTikTokFatigue(last7, prev7);
  else                        result = calcRedditFatigue(last7, prev7);

  return { ...result, label: fatigueLabel(result.score) };
}

export function scoreAllFatigue(db) {
  const today = new Date().toISOString().slice(0, 10);
  const ads   = db.prepare(`SELECT id, platform FROM ads WHERE status = 'ACTIVE'`).all();

  const update = db.prepare(`
    UPDATE ad_metrics SET fatigue_score = ?
    WHERE ad_id = ? AND date = ?
  `);

  let updated = 0;
  for (const ad of ads) {
    const { score } = scoreFatigue(db, ad.id, ad.platform, today);
    // Only update today's row if it exists
    const changed = update.run(score, ad.id, today);
    if (changed.changes > 0) updated++;
  }

  console.log(`[Fatigue] Scored ${updated} ads`);
  return updated;
}
