/**
 * Reddit Ads API scraper — READ-ONLY.
 * Fetches campaigns, active ads, and performance metrics from the Reddit Ads API.
 *
 * Required env vars: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_AD_ACCOUNT_ID
 */

import axios from 'axios';

const AUTH_URL = 'https://www.reddit.com/api/v1/access_token';
const ADS_BASE = 'https://ads-api.reddit.com/api/v2.1';

/**
 * Obtain an OAuth2 bearer token using client credentials.
 */
async function getAccessToken(clientId, clientSecret) {
  const res = await axios.post(AUTH_URL, 'grant_type=client_credentials', {
    auth: { username: clientId, password: clientSecret },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return res.data.access_token;
}

/**
 * Create an authenticated API client for Reddit Ads.
 */
function redditApi(token) {
  return axios.create({
    baseURL: ADS_BASE,
    headers: { Authorization: `Bearer ${token}` }
  });
}

/**
 * Fetch campaigns for the account.
 */
async function fetchCampaigns(api, accountId) {
  const res = await api.get(`/accounts/${accountId}/campaigns`);
  return res.data?.data || [];
}

/**
 * Fetch active ads for the account.
 */
async function fetchAds(api, accountId) {
  const res = await api.get(`/accounts/${accountId}/ads`);
  return res.data?.data || [];
}

/**
 * Fetch ad-level performance report for the last 30 days.
 */
async function fetchReport(api, accountId) {
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const res = await api.get(`/accounts/${accountId}/report`, {
    params: {
      starts_at: startDate,
      ends_at: endDate,
      group_by: 'ad_id,date',
      fields: 'spend,impressions,clicks,ctr,cpm,conversions'
    }
  });

  return res.data?.data || [];
}

/**
 * Main sync function — pulls Reddit ads + metrics and saves to the database.
 * @param {import('better-sqlite3').Database} db
 */
export async function syncRedditAds(db) {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const accountId = process.env.REDDIT_AD_ACCOUNT_ID;

  if (!clientId || !clientSecret || !accountId) {
    console.log('[reddit] Skipping — REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, or REDDIT_AD_ACCOUNT_ID not set.');
    return;
  }

  console.log('[reddit] Authenticating...');
  let bearerToken;
  try {
    bearerToken = await getAccessToken(clientId, clientSecret);
  } catch (err) {
    console.error('[reddit] Auth failed:', err.message);
    return;
  }

  const api = redditApi(bearerToken);

  console.log('[reddit] Fetching campaigns...');
  const campaigns = await fetchCampaigns(api, accountId);
  const campaignMap = new Map(campaigns.map(c => [c.id, c]));

  console.log('[reddit] Fetching ads...');
  const ads = await fetchAds(api, accountId);
  console.log(`[reddit] Found ${ads.length} ads.`);

  const upsertAd = db.prepare(`
    INSERT INTO ads (id, platform, campaign_id, campaign_name, adset_id, adset_name,
                     ad_name, status, format, thumbnail_url, creative_body, headline, updated_at)
    VALUES (?, 'reddit', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      campaign_name = excluded.campaign_name,
      ad_name       = excluded.ad_name,
      status        = excluded.status,
      format        = excluded.format,
      thumbnail_url = excluded.thumbnail_url,
      creative_body = excluded.creative_body,
      headline      = excluded.headline,
      updated_at    = excluded.updated_at
  `);

  for (const ad of ads) {
    const campaign = campaignMap.get(ad.campaign_id) || {};
    const status = ad.status === 'ACTIVE' ? 'ACTIVE' : (ad.status || 'PAUSED');

    upsertAd.run(
      String(ad.id),
      String(ad.campaign_id || ''),
      campaign.name || '',
      String(ad.ad_group_id || ''),
      '',
      ad.name || '',
      status,
      'IMAGE',
      ad.thumbnail_url || ad.click_url || '',
      ad.body || '',
      ad.headline || ''
    );
  }

  console.log('[reddit] Fetching report (last 30 days)...');
  const report = await fetchReport(api, accountId);
  console.log(`[reddit] Got ${report.length} report rows.`);

  const upsertMetric = db.prepare(`
    INSERT INTO ad_metrics (ad_id, platform, date, spend, impressions, clicks,
                            ctr, frequency, thumb_stop_rate, consultations, cpm, cpp, fatigue_score)
    VALUES (?, 'reddit', ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL)
    ON CONFLICT(ad_id, date) DO UPDATE SET
      spend         = excluded.spend,
      impressions   = excluded.impressions,
      clicks        = excluded.clicks,
      ctr           = excluded.ctr,
      consultations = excluded.consultations,
      cpm           = excluded.cpm,
      cpp           = excluded.cpp
  `);

  for (const row of report) {
    const conversions = parseInt(row.conversions, 10) || 0;
    const spend = parseFloat(row.spend) || 0;
    const cpp = conversions > 0 ? spend / conversions : 0;

    upsertMetric.run(
      String(row.ad_id),
      row.date,
      spend,
      parseInt(row.impressions, 10) || 0,
      parseInt(row.clicks, 10) || 0,
      parseFloat(row.ctr) || 0,
      conversions,
      parseFloat(row.cpm) || 0,
      cpp
    );
  }

  console.log('[reddit] Sync complete.');
}
