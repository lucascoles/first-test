/**
 * Creative Fatigue Scoring Engine.
 *
 * Fatigue Score: 0–100 (higher = more fatigued)
 *   0–30:  Healthy  (green)
 *   31–60: Watch    (yellow)
 *   61–80: Warning  (orange) — suggest refresh
 *   81–100: Critical (red)   — suggest swap/pause
 *
 * Signals vary by platform — see spec for full formula.
 */

/**
 * Clamp a value between min and max.
 */
function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

/**
 * Get aggregated metrics for a date window.
 * Returns { avgCtr, avgCpm, avgCpp, avgFrequency, avgThumbStop, totalSpend }
 */
function getWindowMetrics(db, adId, startDate, endDate) {
  const row = db.prepare(`
    SELECT
      AVG(ctr) as avgCtr,
      AVG(cpm) as avgCpm,
      AVG(cpp) as avgCpp,
      AVG(frequency) as avgFrequency,
      AVG(thumb_stop_rate) as avgThumbStop,
      SUM(spend) as totalSpend,
      SUM(impressions) as totalImpressions,
      SUM(clicks) as totalClicks,
      SUM(consultations) as totalConsultations
    FROM ad_metrics
    WHERE ad_id = ? AND date >= ? AND date <= ?
  `).get(adId, startDate, endDate);

  return {
    avgCtr: row?.avgCtr || 0,
    avgCpm: row?.avgCpm || 0,
    avgCpp: row?.avgCpp || 0,
    avgFrequency: row?.avgFrequency || 0,
    avgThumbStop: row?.avgThumbStop || 0,
    totalSpend: row?.totalSpend || 0,
    totalImpressions: row?.totalImpressions || 0,
    totalClicks: row?.totalClicks || 0,
    totalConsultations: row?.totalConsultations || 0,
  };
}

/**
 * Compute date strings for the last 7d and prior 7d windows relative to a date.
 */
function getWindows(dateStr) {
  const d = new Date(dateStr);
  const last7End = dateStr;
  const last7Start = new Date(d - 7 * 86400000).toISOString().slice(0, 10);
  const prior7End = new Date(d - 7 * 86400000).toISOString().slice(0, 10);
  const prior7Start = new Date(d - 14 * 86400000).toISOString().slice(0, 10);
  return { last7Start, last7End, prior7Start, prior7End };
}

/**
 * Score fatigue for a Meta ad.
 *
 * Frequency signal (40%): clamp((freq - 2.5) / 4.5, 0, 1) * 100
 * CTR decay signal (35%): compare last 7d CTR vs prior 7d CTR
 * CPM inflation signal (25%): compare last 7d CPM vs prior 7d
 */
function scoreMetaFatigue(db, adId, date) {
  const { last7Start, last7End, prior7Start, prior7End } = getWindows(date);
  const recent = getWindowMetrics(db, adId, last7Start, last7End);
  const prior = getWindowMetrics(db, adId, prior7Start, prior7End);

  // Frequency signal
  const freqSignal = clamp((recent.avgFrequency - 2.5) / 4.5, 0, 1) * 100;

  // CTR decay signal
  let ctrDecaySignal = 0;
  if (prior.avgCtr > 0) {
    const ctrDrop = (prior.avgCtr - recent.avgCtr) / prior.avgCtr;
    ctrDecaySignal = clamp(ctrDrop / 0.5, 0, 1) * 100; // 50% drop = max signal
  }

  // CPM inflation signal
  let cpmSignal = 0;
  if (prior.avgCpm > 0) {
    const cpmRise = (recent.avgCpm - prior.avgCpm) / prior.avgCpm;
    cpmSignal = clamp(cpmRise / 0.5, 0, 1) * 100;
  }

  const score = Math.round(freqSignal * 0.4 + ctrDecaySignal * 0.35 + cpmSignal * 0.25);

  return {
    score: clamp(score, 0, 100),
    signals: {
      frequency: { value: recent.avgFrequency, signal: Math.round(freqSignal), weight: '40%' },
      ctrDecay: { recentCtr: recent.avgCtr, priorCtr: prior.avgCtr, signal: Math.round(ctrDecaySignal), weight: '35%' },
      cpmInflation: { recentCpm: recent.avgCpm, priorCpm: prior.avgCpm, signal: Math.round(cpmSignal), weight: '25%' }
    }
  };
}

/**
 * Score fatigue for a TikTok ad.
 *
 * Thumb Stop decay (40%): compare last 7d thumb stop vs prior 7d
 * CTR decay (30%)
 * CPP inflation (30%): cost per consultation trending up
 */
function scoreTikTokFatigue(db, adId, date) {
  const { last7Start, last7End, prior7Start, prior7End } = getWindows(date);
  const recent = getWindowMetrics(db, adId, last7Start, last7End);
  const prior = getWindowMetrics(db, adId, prior7Start, prior7End);

  // Thumb stop decay
  let thumbDecaySignal = 0;
  if (prior.avgThumbStop > 0) {
    const drop = (prior.avgThumbStop - recent.avgThumbStop) / prior.avgThumbStop;
    thumbDecaySignal = clamp(drop / 0.5, 0, 1) * 100;
  }

  // CTR decay
  let ctrDecaySignal = 0;
  if (prior.avgCtr > 0) {
    const drop = (prior.avgCtr - recent.avgCtr) / prior.avgCtr;
    ctrDecaySignal = clamp(drop / 0.5, 0, 1) * 100;
  }

  // CPP inflation
  let cppSignal = 0;
  if (prior.avgCpp > 0) {
    const rise = (recent.avgCpp - prior.avgCpp) / prior.avgCpp;
    cppSignal = clamp(rise / 0.5, 0, 1) * 100;
  }

  const score = Math.round(thumbDecaySignal * 0.4 + ctrDecaySignal * 0.3 + cppSignal * 0.3);

  return {
    score: clamp(score, 0, 100),
    signals: {
      thumbStopDecay: { recent: recent.avgThumbStop, prior: prior.avgThumbStop, signal: Math.round(thumbDecaySignal), weight: '40%' },
      ctrDecay: { recentCtr: recent.avgCtr, priorCtr: prior.avgCtr, signal: Math.round(ctrDecaySignal), weight: '30%' },
      cppInflation: { recentCpp: recent.avgCpp, priorCpp: prior.avgCpp, signal: Math.round(cppSignal), weight: '30%' }
    }
  };
}

/**
 * Score fatigue for a Reddit ad.
 *
 * Benchmark-based (no frequency data):
 * CTR vs adset average (50%), CPP vs adset average (50%)
 */
function scoreRedditFatigue(db, adId, date) {
  const { last7Start, last7End } = getWindows(date);

  // Get this ad's ad set
  const ad = db.prepare('SELECT adset_id FROM ads WHERE id = ?').get(adId);
  if (!ad || !ad.adset_id) {
    return { score: 0, signals: { note: 'No adset data available' } };
  }

  // Get all peer ads in the same adset
  const peers = db.prepare('SELECT id FROM ads WHERE adset_id = ? AND platform = ?').all(ad.adset_id, 'reddit');

  if (peers.length <= 1) {
    // Can't benchmark with no peers — use simple CTR/CPP trend
    const recent = getWindowMetrics(db, adId, last7Start, last7End);
    const { prior7Start, prior7End } = getWindows(date);
    const prior = getWindowMetrics(db, adId, prior7Start, prior7End);

    let ctrSignal = 0;
    if (prior.avgCtr > 0) {
      const drop = (prior.avgCtr - recent.avgCtr) / prior.avgCtr;
      ctrSignal = clamp(drop / 0.5, 0, 1) * 100;
    }

    let cppSignal = 0;
    if (prior.avgCpp > 0) {
      const rise = (recent.avgCpp - prior.avgCpp) / prior.avgCpp;
      cppSignal = clamp(rise / 0.5, 0, 1) * 100;
    }

    const score = Math.round(ctrSignal * 0.5 + cppSignal * 0.5);
    return { score: clamp(score, 0, 100), signals: { ctrDecay: Math.round(ctrSignal), cppInflation: Math.round(cppSignal) } };
  }

  // Get average CTR/CPP across all peers
  const peerIds = peers.map(p => p.id);
  const placeholders = peerIds.map(() => '?').join(',');
  const peerAvg = db.prepare(`
    SELECT AVG(ctr) as avgCtr, AVG(cpp) as avgCpp
    FROM ad_metrics
    WHERE ad_id IN (${placeholders}) AND date >= ? AND date <= ?
  `).get(...peerIds, last7Start, last7End);

  const recent = getWindowMetrics(db, adId, last7Start, last7End);

  let ctrIndex = 1;
  if (peerAvg?.avgCtr > 0) {
    ctrIndex = recent.avgCtr / peerAvg.avgCtr;
  }

  let cppIndex = 1;
  if (recent.avgCpp > 0 && peerAvg?.avgCpp > 0) {
    cppIndex = peerAvg.avgCpp / recent.avgCpp; // Higher is better (cheaper)
  }

  // Lower index = worse performance = higher fatigue
  const combinedIndex = ctrIndex * 0.5 + cppIndex * 0.5;
  const score = Math.round(clamp((1 - combinedIndex) * 100, 0, 100));

  return {
    score: clamp(score, 0, 100),
    signals: {
      ctrVsPeers: { adCtr: recent.avgCtr, peerAvgCtr: peerAvg?.avgCtr || 0, index: ctrIndex.toFixed(2) },
      cppVsPeers: { adCpp: recent.avgCpp, peerAvgCpp: peerAvg?.avgCpp || 0, index: cppIndex.toFixed(2) }
    }
  };
}

/**
 * Score fatigue for a single ad.
 * @param {import('better-sqlite3').Database} db
 * @param {string} adId
 * @param {string} platform - 'meta' | 'tiktok' | 'reddit'
 * @param {string} date - YYYY-MM-DD
 * @returns {{ score: number, signals: object }}
 */
export function scoreFatigue(db, adId, platform, date) {
  switch (platform) {
    case 'meta':   return scoreMetaFatigue(db, adId, date);
    case 'tiktok': return scoreTikTokFatigue(db, adId, date);
    case 'reddit': return scoreRedditFatigue(db, adId, date);
    default:       return { score: 0, signals: { note: `Unknown platform: ${platform}` } };
  }
}

/**
 * Score fatigue for ALL active ads and save scores to ad_metrics.
 * @param {import('better-sqlite3').Database} db
 */
export function scoreAllFatigue(db) {
  const today = new Date().toISOString().slice(0, 10);

  const activeAds = db.prepare(`SELECT id, platform FROM ads WHERE status = 'ACTIVE'`).all();
  console.log(`[fatigue] Scoring ${activeAds.length} active ads...`);

  const update = db.prepare(`
    UPDATE ad_metrics SET fatigue_score = ? WHERE ad_id = ? AND date = ?
  `);

  let scored = 0;
  for (const ad of activeAds) {
    const { score } = scoreFatigue(db, ad.id, ad.platform, today);
    const result = update.run(score, ad.id, today);
    if (result.changes > 0) scored++;
  }

  console.log(`[fatigue] Updated fatigue scores for ${scored} ad-day rows.`);
}
