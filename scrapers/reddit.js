// scrapers/reddit.js
// READ-ONLY Reddit Ads API client.
// Pulls active ads + performance data.
// NEVER writes, edits, or modifies any ad.
//
// NOTE: Reddit's Ads API is less mature than Meta/TikTok.
// If the API is unavailable, this module logs a warning and
// skips gracefully — it won't break the rest of the sync.

import axios from 'axios';

const REDDIT_AUTH = 'https://www.reddit.com/api/v1/access_token';
const REDDIT_ADS  = 'https://ads-api.reddit.com/api/v2.1';

// Get a short-lived OAuth token
async function getRedditToken() {
  const clientId     = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username     = process.env.REDDIT_USERNAME;

  if (!clientId || !clientSecret) return null;

  const resp = await axios.post(
    REDDIT_AUTH,
    'grant_type=client_credentials',
    {
      auth: { username: clientId, password: clientSecret },
      headers: { 'User-Agent': 'XyonCommandCentre/1.0' }
    }
  );
  return resp.data?.access_token ?? null;
}

export async function syncRedditAds(db) {
  const accountId = process.env.REDDIT_AD_ACCOUNT_ID;

  if (!accountId || !process.env.REDDIT_CLIENT_ID) {
    console.warn('[Reddit] Missing Reddit credentials — skipping Reddit sync');
    return { synced: 0, error: 'credentials_missing' };
  }

  console.log('[Reddit] Starting sync...');

  let token;
  try {
    token = await getRedditToken();
    if (!token) throw new Error('Could not obtain Reddit access token');
  } catch (err) {
    console.warn('[Reddit] Auth failed:', err.message, '— skipping');
    return { synced: 0, error: err.message };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'XyonCommandCentre/1.0'
  };

  try {
    // ── 1. Fetch campaigns ───────────────────────────────────────────────
    const campaignsResp = await axios.get(
      `${REDDIT_ADS}/accounts/${accountId}/campaigns`,
      { headers, params: { status: 'ACTIVE', limit: 200 } }
    );
    const campaigns = campaignsResp.data?.data ?? [];

    const upsertCampaign = db.prepare(`
      INSERT INTO campaign_config (campaign_id, platform, campaign_name, primary_metric)
      VALUES (@campaign_id, 'reddit', @campaign_name, 'consultations')
      ON CONFLICT(campaign_id) DO UPDATE SET campaign_name = excluded.campaign_name
    `);

    for (const c of campaigns) {
      upsertCampaign.run({
        campaign_id:   `reddit_${c.id}`,
        campaign_name: c.name
      });
    }

    // ── 2. Fetch active ads ──────────────────────────────────────────────
    const adsResp = await axios.get(
      `${REDDIT_ADS}/accounts/${accountId}/ads`,
      { headers, params: { status: 'ACTIVE', limit: 500 } }
    );
    const adsData = adsResp.data?.data ?? [];
    console.log(`[Reddit] Found ${adsData.length} active ads`);

    const upsertAd = db.prepare(`
      INSERT INTO ads (id, platform, campaign_id, adset_id, ad_name, status, format, creative_body, headline, updated_at)
      VALUES (@id, 'reddit', @campaign_id, @adset_id, @ad_name, @status, @format, @creative_body, @headline, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        status        = excluded.status,
        creative_body = excluded.creative_body,
        headline      = excluded.headline,
        updated_at    = excluded.updated_at
    `);

    for (const ad of adsData) {
      const creative = ad.creative ?? {};
      upsertAd.run({
        id:            `reddit_${ad.id}`,
        campaign_id:   `reddit_${ad.campaign_id ?? ''}`,
        adset_id:      `reddit_${ad.ad_group_id ?? ''}`,
        ad_name:       ad.name ?? '',
        status:        ad.status ?? 'UNKNOWN',
        format:        ad.type === 'video' ? 'VIDEO' : 'IMAGE',
        creative_body: creative.body ?? '',
        headline:      creative.headline ?? ad.name ?? '',
        updated_at:    new Date().toISOString()
      });
    }

    // ── 3. Fetch performance report (last 30 days) ───────────────────────
    const today = new Date();
    const since = new Date(today);
    since.setDate(since.getDate() - 30);

    const reportResp = await axios.get(
      `${REDDIT_ADS}/accounts/${accountId}/report`,
      {
        headers,
        params: {
          breakdown: 'ad,date',
          start_date: since.toISOString().slice(0, 10),
          end_date:   today.toISOString().slice(0, 10),
          fields: 'spend,impressions,clicks,ctr,cpm,conversions',
          limit: 5000
        }
      }
    );

    const reportRows = reportResp.data?.data ?? [];
    console.log(`[Reddit] Fetched ${reportRows.length} report rows`);

    const upsertMetric = db.prepare(`
      INSERT INTO ad_metrics
        (ad_id, platform, date, spend, impressions, clicks, ctr, cpm, consultations, cpp)
      VALUES
        (@ad_id, 'reddit', @date, @spend, @impressions, @clicks, @ctr, @cpm, @consultations, @cpp)
      ON CONFLICT(ad_id, date) DO UPDATE SET
        spend        = excluded.spend,
        impressions  = excluded.impressions,
        clicks       = excluded.clicks,
        ctr          = excluded.ctr,
        cpm          = excluded.cpm,
        consultations = excluded.consultations,
        cpp          = excluded.cpp
    `);

    for (const row of reportRows) {
      const spend = parseFloat(row.spend ?? 0);
      const consultations = parseInt(row.conversions ?? 0);
      const cpp = consultations > 0 ? spend / consultations : 0;

      upsertMetric.run({
        ad_id:        `reddit_${row.ad_id}`,
        date:         row.date,
        spend,
        impressions:  parseInt(row.impressions ?? 0),
        clicks:       parseInt(row.clicks ?? 0),
        ctr:          parseFloat(row.ctr ?? 0),
        cpm:          parseFloat(row.cpm ?? 0),
        consultations,
        cpp
      });
    }

    console.log(`[Reddit] Sync complete — ${adsData.length} ads, ${reportRows.length} metric rows`);
    return { synced: adsData.length };

  } catch (err) {
    const msg = err.response?.data?.message ?? err.message;
    console.error('[Reddit] Sync failed:', msg);
    return { synced: 0, error: msg };
  }
}
