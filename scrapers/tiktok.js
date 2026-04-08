/**
 * TikTok Ads API scraper — READ-ONLY.
 * Fetches active ads and performance reports from TikTok Ads API v1.3.
 *
 * Required env vars: TIKTOK_ACCESS_TOKEN, TIKTOK_ADVERTISER_ID
 */

import axios from 'axios';

const BASE = 'https://business-api.tiktok.com/open_api/v1.3';

/**
 * Helper to make TikTok API requests with auth header.
 */
function ttApi(token) {
  return axios.create({
    baseURL: BASE,
    headers: { 'Access-Token': token }
  });
}

/**
 * Fetch all active ads.
 */
async function fetchActiveAds(api, advertiserId) {
  const res = await api.get('/ad/get/', {
    params: {
      advertiser_id: advertiserId,
      filtering: JSON.stringify({
        status: 'AD_STATUS_DELIVERY_OK'
      }),
      page_size: 100,
      page: 1
    }
  });

  const data = res.data?.data;
  if (!data) return [];
  return data.list || [];
}

/**
 * Fetch ad-level performance report for the last 30 days.
 */
async function fetchReport(api, advertiserId) {
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const res = await api.get('/report/integrated/get/', {
    params: {
      advertiser_id: advertiserId,
      report_type: 'BASIC',
      data_level: 'AUCTION_AD',
      dimensions: JSON.stringify(['ad_id', 'stat_time_day']),
      metrics: JSON.stringify([
        'spend', 'impressions', 'clicks', 'ctr', 'cpm',
        'video_play_actions', 'video_watched_2s', 'conversion',
        'cost_per_conversion'
      ]),
      start_date: startDate,
      end_date: endDate,
      page_size: 500,
      page: 1
    }
  });

  const data = res.data?.data;
  if (!data) return [];
  return data.list || [];
}

/**
 * Main sync function — pulls TikTok ads + metrics and saves to the database.
 * @param {import('better-sqlite3').Database} db
 */
export async function syncTikTokAds(db) {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  const advertiserId = process.env.TIKTOK_ADVERTISER_ID;

  if (!token || !advertiserId) {
    console.log('[tiktok] Skipping — TIKTOK_ACCESS_TOKEN or TIKTOK_ADVERTISER_ID not set.');
    return;
  }

  const api = ttApi(token);

  console.log('[tiktok] Fetching active ads...');
  const ads = await fetchActiveAds(api, advertiserId);
  console.log(`[tiktok] Found ${ads.length} active ads.`);

  const upsertAd = db.prepare(`
    INSERT INTO ads (id, platform, campaign_id, campaign_name, adset_id, adset_name,
                     ad_name, status, format, thumbnail_url, creative_body, headline, updated_at)
    VALUES (?, 'tiktok', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      campaign_name = excluded.campaign_name,
      adset_name    = excluded.adset_name,
      ad_name       = excluded.ad_name,
      status        = excluded.status,
      format        = excluded.format,
      thumbnail_url = excluded.thumbnail_url,
      creative_body = excluded.creative_body,
      headline      = excluded.headline,
      updated_at    = excluded.updated_at
  `);

  for (const ad of ads) {
    const isVideo = ad.image_mode === 'VIDEO' || ad.video_id;
    upsertAd.run(
      String(ad.ad_id),
      String(ad.campaign_id || ''),
      ad.campaign_name || '',
      String(ad.adgroup_id || ''),
      ad.adgroup_name || '',
      ad.ad_name || '',
      'ACTIVE',
      isVideo ? 'VIDEO' : 'IMAGE',
      ad.avatar_icon_web_uri || ad.image_ids?.[0] || '',
      ad.ad_text || '',
      ad.ad_name || ''
    );
  }

  console.log('[tiktok] Fetching performance report (last 30 days)...');
  const report = await fetchReport(api, advertiserId);
  console.log(`[tiktok] Got ${report.length} report rows.`);

  const upsertMetric = db.prepare(`
    INSERT INTO ad_metrics (ad_id, platform, date, spend, impressions, clicks,
                            ctr, frequency, thumb_stop_rate, consultations, cpm, cpp, fatigue_score)
    VALUES (?, 'tiktok', ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL)
    ON CONFLICT(ad_id, date) DO UPDATE SET
      spend           = excluded.spend,
      impressions     = excluded.impressions,
      clicks          = excluded.clicks,
      ctr             = excluded.ctr,
      thumb_stop_rate = excluded.thumb_stop_rate,
      consultations   = excluded.consultations,
      cpm             = excluded.cpm,
      cpp             = excluded.cpp
  `);

  for (const row of report) {
    const metrics = row.metrics || {};
    const dims = row.dimensions || {};

    const impressions = parseInt(metrics.impressions, 10) || 0;
    const watched2s = parseInt(metrics.video_watched_2s, 10) || 0;
    const thumbStopRate = impressions > 0 ? watched2s / impressions : 0;
    const conversions = parseInt(metrics.conversion, 10) || 0;
    const spend = parseFloat(metrics.spend) || 0;
    const cpp = conversions > 0 ? spend / conversions : 0;

    // TikTok returns stat_time_day as "YYYY-MM-DD HH:MM:SS"
    const date = (dims.stat_time_day || '').slice(0, 10);

    upsertMetric.run(
      String(dims.ad_id),
      date,
      spend,
      impressions,
      parseInt(metrics.clicks, 10) || 0,
      parseFloat(metrics.ctr) || 0,
      thumbStopRate,
      conversions,
      parseFloat(metrics.cpm) || 0,
      cpp
    );
  }

  console.log('[tiktok] Sync complete.');
}
