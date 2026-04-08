// scrapers/tiktok.js
// READ-ONLY TikTok Ads API client (v1.3).
// Pulls active ads + performance data.
// NEVER writes, edits, or modifies any ad.

import axios from 'axios';

const BASE = 'https://business-api.tiktok.com/open_api/v1.3';

export async function syncTikTokAds(db) {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  const advertiserId = process.env.TIKTOK_ADVERTISER_ID;

  if (!token || !advertiserId) {
    console.warn('[TikTok] Missing TIKTOK_ACCESS_TOKEN or TIKTOK_ADVERTISER_ID — skipping TikTok sync');
    return { synced: 0, error: 'credentials_missing' };
  }

  console.log('[TikTok] Starting sync...');

  const headers = { 'Access-Token': token };

  try {
    // ── 1. Fetch all ACTIVE ads ──────────────────────────────────────────
    const adsResp = await axios.get(`${BASE}/ad/get/`, {
      headers,
      params: {
        advertiser_id: advertiserId,
        fields: JSON.stringify([
          'ad_id', 'ad_name', 'status', 'adgroup_id', 'campaign_id',
          'image_ids', 'video_id', 'ad_text', 'call_to_action',
          'ad_format'
        ]),
        filtering: JSON.stringify({ primary_status: 'STATUS_ACTIVE' }),
        page_size: 1000
      }
    });

    const adsData = adsResp.data?.data?.list ?? [];
    console.log(`[TikTok] Found ${adsData.length} active ads`);

    const upsertAd = db.prepare(`
      INSERT INTO ads (id, platform, campaign_id, adset_id, ad_name, status, format, creative_body, updated_at)
      VALUES (@id, 'tiktok', @campaign_id, @adset_id, @ad_name, @status, @format, @creative_body, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        status        = excluded.status,
        creative_body = excluded.creative_body,
        updated_at    = excluded.updated_at
    `);

    for (const ad of adsData) {
      const format = ad.ad_format === 'VIDEO' ? 'VIDEO' : 'IMAGE';
      upsertAd.run({
        id:            `tiktok_${ad.ad_id}`,
        campaign_id:   `tiktok_${ad.campaign_id}`,
        adset_id:      `tiktok_${ad.adgroup_id}`,
        ad_name:       ad.ad_name ?? '',
        status:        ad.status ?? 'UNKNOWN',
        format,
        creative_body: ad.ad_text ?? '',
        updated_at:    new Date().toISOString()
      });
    }

    // ── 2. Fetch performance reports ─────────────────────────────────────
    const today = new Date();
    const since = new Date(today);
    since.setDate(since.getDate() - 30);

    const reportResp = await axios.post(`${BASE}/report/integrated/get/`, {
      advertiser_id: advertiserId,
      report_type: 'BASIC',
      data_level: 'AUCTION_AD',
      dimensions: ['ad_id', 'stat_time_day'],
      metrics: [
        'spend', 'impressions', 'clicks', 'ctr', 'cpm',
        'video_play_actions',       // total plays
        'video_watched_2s',         // thumb-stop proxy
        'result',                   // conversions (consultations)
        'cost_per_result'
      ],
      start_date: since.toISOString().slice(0, 10),
      end_date: today.toISOString().slice(0, 10),
      filtering: JSON.stringify([{ filter_value: ['STATUS_ACTIVE'], field_name: 'ad_status', filter_type: 'IN' }]),
      page_size: 1000
    }, { headers });

    const rows = reportResp.data?.data?.list ?? [];
    console.log(`[TikTok] Fetched ${rows.length} report rows`);

    const upsertMetric = db.prepare(`
      INSERT INTO ad_metrics
        (ad_id, platform, date, spend, impressions, clicks, ctr, cpm, thumb_stop_rate, consultations, cpp)
      VALUES
        (@ad_id, 'tiktok', @date, @spend, @impressions, @clicks, @ctr, @cpm, @thumb_stop_rate, @consultations, @cpp)
      ON CONFLICT(ad_id, date) DO UPDATE SET
        spend           = excluded.spend,
        impressions     = excluded.impressions,
        clicks          = excluded.clicks,
        ctr             = excluded.ctr,
        cpm             = excluded.cpm,
        thumb_stop_rate = excluded.thumb_stop_rate,
        consultations   = excluded.consultations,
        cpp             = excluded.cpp
    `);

    const upsertCampaign = db.prepare(`
      INSERT INTO campaign_config (campaign_id, platform, campaign_name, primary_metric)
      VALUES (@campaign_id, 'tiktok', @campaign_name, 'consultations')
      ON CONFLICT(campaign_id) DO NOTHING
    `);

    for (const row of rows) {
      const metrics = row.metrics ?? {};
      const dims = row.dimensions ?? {};
      const impressions = parseInt(metrics.impressions ?? 0);
      const watched2s = parseInt(metrics.video_watched_2s ?? 0);
      const thumbStopRate = impressions > 0 ? watched2s / impressions : 0;
      const spend = parseFloat(metrics.spend ?? 0);
      const consultations = parseInt(metrics.result ?? 0);
      const cpp = consultations > 0 ? spend / consultations : 0;

      upsertMetric.run({
        ad_id:           `tiktok_${dims.ad_id}`,
        date:            dims.stat_time_day?.slice(0, 10),
        spend,
        impressions,
        clicks:          parseInt(metrics.clicks ?? 0),
        ctr:             parseFloat(metrics.ctr ?? 0),
        cpm:             parseFloat(metrics.cpm ?? 0),
        thumb_stop_rate: thumbStopRate,
        consultations,
        cpp
      });
    }

    // Upsert campaign configs
    const campaignsResp = await axios.get(`${BASE}/campaign/get/`, {
      headers,
      params: {
        advertiser_id: advertiserId,
        fields: JSON.stringify(['campaign_id', 'campaign_name']),
        page_size: 500
      }
    });

    for (const c of campaignsResp.data?.data?.list ?? []) {
      upsertCampaign.run({
        campaign_id:   `tiktok_${c.campaign_id}`,
        campaign_name: c.campaign_name
      });
    }

    console.log(`[TikTok] Sync complete — ${adsData.length} ads, ${rows.length} metric rows`);
    return { synced: adsData.length };

  } catch (err) {
    const msg = err.response?.data?.message ?? err.message;
    console.error('[TikTok] Sync failed:', msg);
    return { synced: 0, error: msg };
  }
}
