// scrapers/meta.js
// READ-ONLY Meta Marketing API client.
// Pulls active ads + 30-day insights from your Meta ad account.
// NEVER writes, edits, or modifies any ad.

import axios from 'axios';

const BASE = 'https://graph.facebook.com/v19.0';

// Fields we want for each ad
const AD_FIELDS = [
  'id', 'name', 'status', 'adset_id', 'campaign_id',
  'creative{id,body,title,image_url,thumbnail_url,object_story_spec}'
].join(',');

// Insight fields we care about
const INSIGHT_FIELDS = [
  'ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name',
  'spend', 'impressions', 'clicks', 'ctr', 'frequency', 'cpm',
  'actions', 'date_start', 'date_stop'
].join(',');

export async function syncMetaAds(db) {
  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;

  if (!token || !accountId) {
    console.warn('[Meta] Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID — skipping Meta sync');
    return { synced: 0, error: 'credentials_missing' };
  }

  console.log('[Meta] Starting sync...');

  try {
    // ── 1. Fetch all ACTIVE ads ──────────────────────────────────────────
    const adsResp = await axios.get(`${BASE}/${accountId}/ads`, {
      params: {
        access_token: token,
        fields: AD_FIELDS,
        filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
        limit: 500
      }
    });

    const ads = adsResp.data?.data ?? [];
    console.log(`[Meta] Found ${ads.length} active ads`);

    // Upsert each ad into the ads table
    const upsertAd = db.prepare(`
      INSERT INTO ads (id, platform, campaign_id, adset_id, ad_name, status, format, thumbnail_url, creative_body, headline, updated_at)
      VALUES (@id, 'meta', @campaign_id, @adset_id, @ad_name, @status, @format, @thumbnail_url, @creative_body, @headline, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        status        = excluded.status,
        thumbnail_url = excluded.thumbnail_url,
        creative_body = excluded.creative_body,
        headline      = excluded.headline,
        updated_at    = excluded.updated_at
    `);

    for (const ad of ads) {
      const creative = ad.creative ?? {};
      const story = creative.object_story_spec ?? {};
      const body = creative.body ?? story?.video_data?.message ?? story?.link_data?.message ?? '';
      const headline = creative.title ?? story?.link_data?.name ?? ad.name;
      const thumbnail = creative.thumbnail_url ?? creative.image_url ?? '';
      const format = detectMetaFormat(creative);

      upsertAd.run({
        id: ad.id,
        campaign_id: ad.campaign_id ?? '',
        adset_id: ad.adset_id ?? '',
        ad_name: ad.name ?? '',
        status: ad.status ?? 'UNKNOWN',
        format,
        thumbnail_url: thumbnail,
        creative_body: body,
        headline: headline,
        updated_at: new Date().toISOString()
      });
    }

    // ── 2. Fetch daily insights for last 30 days ─────────────────────────
    const today = new Date();
    const since = new Date(today);
    since.setDate(since.getDate() - 30);

    const insightsResp = await axios.get(`${BASE}/${accountId}/insights`, {
      params: {
        access_token: token,
        fields: INSIGHT_FIELDS,
        level: 'ad',
        time_increment: 1,
        time_range: JSON.stringify({
          since: since.toISOString().slice(0, 10),
          until: today.toISOString().slice(0, 10)
        }),
        filtering: JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: ['ACTIVE'] }]),
        limit: 5000
      }
    });

    const insights = insightsResp.data?.data ?? [];
    console.log(`[Meta] Fetched ${insights.length} insight rows`);

    const upsertMetric = db.prepare(`
      INSERT INTO ad_metrics
        (ad_id, platform, date, spend, impressions, clicks, ctr, frequency, cpm, consultations, cpp)
      VALUES
        (@ad_id, 'meta', @date, @spend, @impressions, @clicks, @ctr, @frequency, @cpm, @consultations, @cpp)
      ON CONFLICT(ad_id, date) DO UPDATE SET
        spend        = excluded.spend,
        impressions  = excluded.impressions,
        clicks       = excluded.clicks,
        ctr          = excluded.ctr,
        frequency    = excluded.frequency,
        cpm          = excluded.cpm,
        consultations = excluded.consultations,
        cpp          = excluded.cpp
    `);

    // Also upsert campaign config (primary metric = consultations for Meta)
    const upsertCampaign = db.prepare(`
      INSERT INTO campaign_config (campaign_id, platform, campaign_name, primary_metric)
      VALUES (@campaign_id, 'meta', @campaign_name, 'consultations')
      ON CONFLICT(campaign_id) DO UPDATE SET campaign_name = excluded.campaign_name
    `);

    for (const row of insights) {
      const consultations = extractAction(row.actions, [
        'offsite_conversion.fb_pixel_schedule',   // booking/consultation
        'offsite_conversion.fb_pixel_lead',
        'lead',
        'omni_app_install'
      ]);

      const spend = parseFloat(row.spend ?? 0);
      const cpp = consultations > 0 ? spend / consultations : 0;

      upsertMetric.run({
        ad_id:         row.ad_id,
        date:          row.date_start,
        spend,
        impressions:   parseInt(row.impressions ?? 0),
        clicks:        parseInt(row.clicks ?? 0),
        ctr:           parseFloat(row.ctr ?? 0),
        frequency:     parseFloat(row.frequency ?? 0),
        cpm:           parseFloat(row.cpm ?? 0),
        consultations,
        cpp
      });

      upsertCampaign.run({
        campaign_id:   row.campaign_id,
        campaign_name: row.campaign_name
      });
    }

    console.log(`[Meta] Sync complete — ${ads.length} ads, ${insights.length} metric rows`);
    return { synced: ads.length };

  } catch (err) {
    const msg = err.response?.data?.error?.message ?? err.message;
    console.error('[Meta] Sync failed:', msg);
    return { synced: 0, error: msg };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractAction(actions, types) {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const a of actions) {
    if (types.includes(a.action_type)) total += parseInt(a.value ?? 0);
  }
  return total;
}

function detectMetaFormat(creative) {
  const spec = creative.object_story_spec ?? {};
  if (spec.video_data) return 'VIDEO';
  if (spec.template_data) return 'CAROUSEL';
  if (spec.link_data?.child_attachments?.length) return 'CAROUSEL';
  return 'IMAGE';
}
