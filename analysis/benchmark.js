/**
 * Ad Set Peer Benchmarking Engine.
 *
 * For TikTok and Reddit (which lack Meta's frequency metric),
 * each ad is benchmarked against its siblings in the same ad set.
 *
 * benchmark_score = (ctr_index * 0.5 + cpp_index * 0.5) * 100
 * Ads scoring <60 trigger a "low performer" flag.
 */

/**
 * Compute benchmark score for a single ad against its ad set peers.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} adId
 * @param {string} platform
 * @param {string} [dateFrom] - Start date for the window (default: last 7 days)
 * @param {string} [dateTo]   - End date (default: today)
 * @returns {{ score: number, ctrIndex: number, cppIndex: number, peerCount: number, flag: string|null }}
 */
export function benchmarkAd(db, adId, platform, dateFrom, dateTo) {
  const end = dateTo || new Date().toISOString().slice(0, 10);
  const start = dateFrom || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  // Find the ad's adset
  const ad = db.prepare('SELECT adset_id FROM ads WHERE id = ?').get(adId);
  if (!ad || !ad.adset_id) {
    return { score: 100, ctrIndex: 1, cppIndex: 1, peerCount: 0, flag: null };
  }

  // Find all peers in the same adset
  const peers = db.prepare(
    'SELECT id FROM ads WHERE adset_id = ? AND platform = ? AND status = ?'
  ).all(ad.adset_id, platform, 'ACTIVE');

  if (peers.length <= 1) {
    return { score: 100, ctrIndex: 1, cppIndex: 1, peerCount: peers.length, flag: null };
  }

  const peerIds = peers.map(p => p.id);
  const placeholders = peerIds.map(() => '?').join(',');

  // Compute peer averages
  const peerAvg = db.prepare(`
    SELECT AVG(ctr) as avgCtr, AVG(cpp) as avgCpp
    FROM ad_metrics
    WHERE ad_id IN (${placeholders}) AND date >= ? AND date <= ?
  `).get(...peerIds, start, end);

  // Get this ad's averages
  const adAvg = db.prepare(`
    SELECT AVG(ctr) as avgCtr, AVG(cpp) as avgCpp
    FROM ad_metrics
    WHERE ad_id = ? AND date >= ? AND date <= ?
  `).get(adId, start, end);

  const peerCtr = peerAvg?.avgCtr || 0;
  const peerCpp = peerAvg?.avgCpp || 0;
  const adCtr = adAvg?.avgCtr || 0;
  const adCpp = adAvg?.avgCpp || 0;

  // CTR index: ad_ctr / peer_ctr_avg (>1 = above average)
  const ctrIndex = peerCtr > 0 ? adCtr / peerCtr : 1;

  // CPP index: peer_cpp_avg / ad_cpp (>1 = more efficient, lower cost)
  const cppIndex = adCpp > 0 ? peerCpp / adCpp : 1;

  // Benchmark score
  const score = Math.round((ctrIndex * 0.5 + cppIndex * 0.5) * 100);
  const clampedScore = Math.min(Math.max(score, 0), 200); // Can exceed 100 for top performers

  // Flag low performers
  const flag = clampedScore < 60 ? 'low_performer' : null;

  return {
    score: clampedScore,
    ctrIndex: parseFloat(ctrIndex.toFixed(2)),
    cppIndex: parseFloat(cppIndex.toFixed(2)),
    peerCount: peers.length,
    flag
  };
}

/**
 * Benchmark all active ads on TikTok and Reddit platforms.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {Array<{ adId: string, platform: string, score: number, flag: string|null }>}
 */
export function benchmarkAll(db) {
  const ads = db.prepare(
    `SELECT id, platform FROM ads WHERE platform IN ('tiktok', 'reddit') AND status = 'ACTIVE'`
  ).all();

  console.log(`[benchmark] Benchmarking ${ads.length} TikTok/Reddit ads...`);

  const results = [];
  for (const ad of ads) {
    const result = benchmarkAd(db, ad.id, ad.platform);
    results.push({ adId: ad.id, platform: ad.platform, ...result });
  }

  const flagged = results.filter(r => r.flag === 'low_performer');
  console.log(`[benchmark] ${flagged.length} ads flagged as low performers.`);

  return results;
}
