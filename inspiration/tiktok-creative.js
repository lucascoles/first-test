// inspiration/tiktok-creative.js
// Fetches trending health/wellness ads from TikTok Creative Center.
// Uses the public-facing Creative Center API (no auth needed for browsing).
// Read-only. No ads are created or modified.

import axios from 'axios';

// TikTok Creative Center API — public, no auth
const BASE = 'https://ads.tiktok.com/creative_radar_api/v1/top_ads/v2/list';

// Industry IDs (TikTok's categorisation)
const HEALTH_WELLNESS_INDUSTRY = 25023;   // Health & Wellness
const BEAUTY_PERSONAL_CARE     = 25022;   // Beauty & Personal Care

export async function fetchTikTokTrending(db) {
  console.log('[TikTokCreative] Fetching trending ads...');

  const today = new Date().toISOString().slice(0, 10);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO inspiration
      (source, brand_name, ad_url, thumbnail_url, description, format, hook_type, fetched_date)
    VALUES
      ('tiktok_creative', ?, ?, ?, ?, ?, ?, ?)
  `);

  let totalSaved = 0;

  const industries = [HEALTH_WELLNESS_INDUSTRY, BEAUTY_PERSONAL_CARE];

  for (const industryId of industries) {
    try {
      const resp = await axios.get(BASE, {
        params: {
          industry_id: industryId,
          country_code: 'AU',
          period_type: 'LAST_7_DAYS',
          order_by: 'vta',        // video through rate — most engaging
          page: 1,
          limit: 10
        },
        headers: {
          // Creative Center is a public page; we mimic a browser request
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://ads.tiktok.com/business/creativecenter/'
        },
        timeout: 10000
      });

      const ads = resp.data?.data?.materials ?? [];

      for (const ad of ads) {
        const saved = insert.run(
          ad.brand_name ?? 'TikTok Trend',
          ad.preview_url ?? ad.share_url ?? '',
          ad.cover_url ?? ad.video_cover_url ?? '',
          (ad.ad_title ?? ad.desc ?? '').slice(0, 500),
          'VIDEO',
          classifyTikTokHook(ad),
          today
        );
        if (saved.changes > 0) totalSaved++;
      }

      await sleep(500);

    } catch (err) {
      // Creative Center API is unofficial; may change or block requests
      // We log but don't crash the whole sync
      console.warn('[TikTokCreative] Could not fetch trending ads:', err.message);
      console.warn('[TikTokCreative] TikTok Creative Center may require manual browsing. Visit: https://ads.tiktok.com/business/creativecenter/');
    }
  }

  // Also try AU-specific trending
  try {
    const resp = await axios.get(BASE, {
      params: {
        industry_id: HEALTH_WELLNESS_INDUSTRY,
        country_code: 'AU',
        period_type: 'LAST_30_DAYS',
        order_by: 'ctr',
        page: 1,
        limit: 10
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://ads.tiktok.com/business/creativecenter/'
      },
      timeout: 10000
    });

    const ads = resp.data?.data?.materials ?? [];
    for (const ad of ads) {
      const saved = insert.run(
        ad.brand_name ?? 'TikTok Trend',
        ad.preview_url ?? ad.share_url ?? '',
        ad.cover_url ?? '',
        (ad.ad_title ?? '').slice(0, 500),
        'VIDEO',
        classifyTikTokHook(ad),
        today
      );
      if (saved.changes > 0) totalSaved++;
    }
  } catch (err) {
    console.warn('[TikTokCreative] Secondary fetch failed:', err.message);
  }

  console.log(`[TikTokCreative] Saved ${totalSaved} new inspiration items`);
  return totalSaved;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function classifyTikTokHook(ad) {
  // TikTok Creative Center sometimes returns hook/scene data
  if (ad.hook_info?.hook_tag) return ad.hook_info.hook_tag;

  const text = `${ad.ad_title ?? ''} ${ad.desc ?? ''}`.toLowerCase();
  if (/before|after|transform/i.test(text)) return 'Before/After';
  if (/day \d+|week \d+|month \d+/i.test(text)) return 'Timeline Journey';
  if (/stitch|duet|response/i.test(text)) return 'Reaction';
  if (/pov:|when you|imagine/i.test(text)) return 'POV / Relatable';
  if (/unbox|reveal|opening/i.test(text)) return 'Unboxing';
  if (/tutorial|how to|step/i.test(text)) return 'Tutorial';
  if (/real|honest|genuine/i.test(text)) return 'Authentic Review';
  return 'Product Demo';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
