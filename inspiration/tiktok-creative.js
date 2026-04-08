/**
 * TikTok Creative Center — Public endpoint scraper.
 *
 * Fetches top trending ads from the TikTok Creative Center
 * in the Health & Wellness industry.
 */

import axios from 'axios';

const CREATIVE_CENTER_URL = 'https://ads.tiktok.com/creative_radar_api/v1/top_ads/v2/list';

/**
 * Fetch top trending health/wellness ads from TikTok Creative Center.
 *
 * @param {object} [opts]
 * @param {number} [opts.industryId=291]  - Industry ID (291 = Health & Wellness)
 * @param {string} [opts.countryCode='AU'] - Country code
 * @param {string} [opts.period='LAST_7_DAYS'] - Time period
 * @param {number} [opts.limit=20] - Max items
 */
async function fetchTopAds(opts = {}) {
  const {
    industryId = 291,
    countryCode = 'AU',
    period = 'LAST_7_DAYS',
    limit = 20
  } = opts;

  try {
    const res = await axios.get(CREATIVE_CENTER_URL, {
      params: {
        industry_id: industryId,
        country_code: countryCode,
        period_type: period,
        page: 1,
        limit
      }
    });

    const data = res.data?.data;
    if (!data) return [];
    return data.materials || data.list || [];
  } catch (err) {
    console.warn('[tiktok-creative] Fetch failed:', err.message);
    return [];
  }
}

/**
 * Classify the hook type from ad text.
 */
function classifyHook(text) {
  if (!text) return 'unknown';
  const lower = text.toLowerCase();
  if (lower.includes('before') && lower.includes('after')) return 'before_after';
  if (lower.includes('doctor') || lower.includes('derm')) return 'authority';
  if (lower.includes('pov') || lower.includes('storytime')) return 'storytelling';
  if (lower.includes('hack') || lower.includes('trick') || lower.includes('secret')) return 'hack';
  if (lower.includes('result') || lower.includes('month')) return 'transformation';
  if (lower.includes('?')) return 'question';
  return 'general';
}

/**
 * Fetch TikTok Creative Center trending ads and save to the database.
 *
 * @param {import('better-sqlite3').Database} db
 */
export async function fetchTikTokCreative(db) {
  console.log('[tiktok-creative] Fetching trending health/wellness ads...');

  const today = new Date().toISOString().slice(0, 10);
  const ads = await fetchTopAds();
  console.log(`[tiktok-creative] Got ${ads.length} trending ads.`);

  const insert = db.prepare(`
    INSERT INTO inspiration (source, brand_name, ad_url, thumbnail_url, description, format, hook_type, fetched_date)
    VALUES ('tiktok_creative', ?, ?, ?, ?, 'VIDEO', ?, ?)
    ON CONFLICT(ad_url) DO UPDATE SET fetched_date = excluded.fetched_date
  `);

  let saved = 0;
  for (const ad of ads) {
    const url = ad.video_url || ad.share_url || ad.item_id || '';
    if (!url) continue;

    insert.run(
      ad.brand_name || ad.nickname || 'Unknown',
      url,
      ad.cover_url || ad.thumbnail_url || '',
      (ad.ad_title || ad.caption || ad.text || '').slice(0, 500),
      classifyHook(ad.ad_title || ad.caption || ad.text || ''),
      today
    );
    saved++;
  }

  console.log(`[tiktok-creative] Saved ${saved} inspiration ads.`);
}
