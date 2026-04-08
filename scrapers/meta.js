/**
 * Meta (Facebook) Marketing API scraper — READ-ONLY.
 * Fetches active ads and their performance metrics from Meta Marketing API v19.0.
 *
 * Required env vars: META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_APP_ID
 */

import axios from 'axios';

const BASE = 'https://graph.facebook.com/v19.0';

/**
 * Fetch all active ads from the Meta ad account.
 */
async function fetchActiveAds(token, accountId) {
  const url = `${BASE}/${accountId}/ads`;
  const params = {
    access_token: token,
    fields: [
      'id', 'name', 'status', 'adset_id', 'adset{name}',
      'campaign_id', 'campaign{name}',
      'creative{body,title,thumbnail_url,object_type}'
    ].join(','),
    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
    limit: 200
  };

  const ads = [];
  let next = url;

  while (next) {
    const res = await axios.get(next, { params: next === url ? params : undefined });
    ads.push(...(res.data.data || []));
    next = res.data.paging?.next || null;
    // After the first request, the cursor URL already includes params
    if (next) params === undefined; // noop, next URL is fully qualified
  }

  return ads;
}

/**
 * Fetch per-ad insights for the last 30 days.
 */
async function fetchInsights(token, accountId) {
  const url = `${BASE}/${accountId}/insights`;
  const params = {
    access_token: token,
    level: 'ad',
    fields: [
      'ad_id', 'ad_name', 'spend', 'impressions', 'clicks',
      'ctr', 'cpm', 'frequency', 'actions'
    ].join(','),
    date_preset: 'last_30d',
    time_increment: 1,       // daily breakdown
    limit: 500
  };

  const rows = [];
  let next = url;

  while (next) {
    const res = await axios.get(next, { params: next === url ? params : undefined });
    rows.push(...(res.data.data || []));
    next = res.data.paging?.next || null;
  }

  return rows;
}

/**
 * Extract consultation count from Meta's "actions" array.
 */
function extractConsultations(actions) {
  if (!Array.isArray(actions)) return 0;
  const evt = actions.find(
    a => a.action_type === 'offsite_conversion.fb_pixel_lead'
      || a.action_type === 'lead'
      || a.action_type === 'complete_registration'
  );
  return evt ? parseInt(evt.value, 10) : 0;
}

/**
 * Determine ad format from creative object_type.
 */
function mapFormat(creative) {
  if (!creative) return 'IMAGE';
  const type = creative.object_type || '';
  if (type.includes('VIDEO')) return 'VIDEO';
  if (type.includes('CAROUSEL')) return 'CAROUSEL';
  return 'IMAGE';
}

/**
 * Main sync function — pulls Meta ads + metrics and saves to the database.
 * @param {import('better-sqlite3').Database} db
 */
export async function syncMetaAds(db) {
  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;

  if (!token || !accountId) {
    console.log('[meta] Skipping — META_ACCESS_TOKEN or META_AD_ACCOUNT_ID not set.');
    return;
  }

  console.log('[meta] Fetching active ads...');
  const ads = await fetchActiveAds(token, accountId);
  console.log(`[meta] Found ${ads.length} active ads.`);

  const upsertAd = db.prepare(`
    INSERT INTO ads (id, platform, campaign_id, campaign_name, adset_id, adset_name,
                     ad_name, status, format, thumbnail_url, creative_body, headline, updated_at)
    VALUES (?, 'meta', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
    const creative = ad.creative || {};
    upsertAd.run(
      ad.id,
      ad.campaign_id,
      ad.campaign?.name || '',
      ad.adset_id,
      ad.adset?.name || '',
      ad.name,
      ad.status,
      mapFormat(creative),
      creative.thumbnail_url || '',
      creative.body || '',
      creative.title || '',
    );
  }

  console.log('[meta] Fetching insights (last 30 days)...');
  const insights = await fetchInsights(token, accountId);
  console.log(`[meta] Got ${insights.length} insight rows.`);

  const upsertMetric = db.prepare(`
    INSERT INTO ad_metrics (ad_id, platform, date, spend, impressions, clicks,
                            ctr, frequency, thumb_stop_rate, consultations, cpm, cpp, fatigue_score)
    VALUES (?, 'meta', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL)
    ON CONFLICT(ad_id, date) DO UPDATE SET
      spend         = excluded.spend,
      impressions   = excluded.impressions,
      clicks        = excluded.clicks,
      ctr           = excluded.ctr,
      frequency     = excluded.frequency,
      consultations = excluded.consultations,
      cpm           = excluded.cpm,
      cpp           = excluded.cpp
  `);

  for (const row of insights) {
    const consultations = extractConsultations(row.actions);
    const spend = parseFloat(row.spend) || 0;
    const cpp = consultations > 0 ? spend / consultations : 0;

    upsertMetric.run(
      row.ad_id,
      row.date_start,
      spend,
      parseInt(row.impressions, 10) || 0,
      parseInt(row.clicks, 10) || 0,
      parseFloat(row.ctr) || 0,
      parseFloat(row.frequency) || 0,
      consultations,
      parseFloat(row.cpm) || 0,
      cpp
    );
  }

  console.log('[meta] Sync complete.');
}
