// analysis/benchmark.js
// Benchmarks each ad against its peers in the same ad set.
// Used for TikTok and Reddit (no frequency data available).
// Also used for Meta as a secondary signal.
//
// benchmark_score > 100 = above average
// benchmark_score 60-100 = at par
// benchmark_score < 60 = underperforming vs peers

export function benchmarkAdSet(db, adsetId, platform, date) {
  const d = date ?? new Date().toISOString().slice(0, 10);

  // Get all ACTIVE ads in this ad set with recent metrics
  const adsetAds = db.prepare(`
    SELECT a.id, a.ad_name,
           AVG(m.ctr) as avg_ctr,
           AVG(m.cpp) as avg_cpp,
           AVG(m.spend) as avg_spend,
           AVG(m.thumb_stop_rate) as avg_thumb_stop
    FROM ads a
    JOIN ad_metrics m ON a.id = m.ad_id
    WHERE a.adset_id = ?
      AND a.platform = ?
      AND a.status = 'ACTIVE'
      AND m.date >= date(?, '-7 days')
      AND m.date <= ?
      AND m.impressions > 100
    GROUP BY a.id, a.ad_name
  `).all(adsetId, platform, d, d);

  if (adsetAds.length < 2) {
    // Can't benchmark with fewer than 2 ads
    return adsetAds.map(ad => ({
      ad_id: ad.id,
      ad_name: ad.ad_name,
      benchmark_score: 100,
      ctr_index: 1,
      cpp_index: 1,
      note: 'solo_ad'
    }));
  }

  const peerCtrAvg = adsetAds.reduce((s, a) => s + (a.avg_ctr ?? 0), 0) / adsetAds.length;
  const peerCppAvg = adsetAds.reduce((s, a) => s + (a.avg_cpp ?? 0), 0) / adsetAds.length;

  return adsetAds.map(ad => {
    const ctrIndex = peerCtrAvg > 0 ? (ad.avg_ctr ?? 0) / peerCtrAvg : 1;
    // cpp_index: lower CPP is better, so invert the ratio
    const cppIndex = (ad.avg_cpp ?? 0) > 0 && peerCppAvg > 0
      ? peerCppAvg / ad.avg_cpp
      : 1;

    // Weight equally for TikTok/Reddit; CTR heavier for Meta
    const benchmarkScore = ((ctrIndex * 0.5) + (cppIndex * 0.5)) * 100;

    return {
      ad_id: ad.id,
      ad_name: ad.ad_name,
      benchmark_score: Math.round(benchmarkScore),
      ctr_index: Math.round(ctrIndex * 100) / 100,
      cpp_index: Math.round(cppIndex * 100) / 100,
      peer_ctr_avg: Math.round(peerCtrAvg * 1000) / 1000,
      peer_cpp_avg: Math.round(peerCppAvg * 100) / 100
    };
  });
}

export function benchmarkAllAdSets(db) {
  const adsets = db.prepare(`
    SELECT DISTINCT adset_id, platform
    FROM ads
    WHERE status = 'ACTIVE' AND adset_id IS NOT NULL AND adset_id != ''
  `).all();

  const results = {};
  for (const { adset_id, platform } of adsets) {
    const scores = benchmarkAdSet(db, adset_id, platform);
    for (const s of scores) {
      results[s.ad_id] = s;
    }
  }
  return results;
}
