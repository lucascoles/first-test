// inspiration/fb-ad-library.js
// Fetches competitor/trending ads from the PUBLIC Facebook Ad Library.
// This uses the public graph.facebook.com/ads_archive endpoint.
// No ads are created or modified — read only.

import axios from 'axios';
import { COMPETITOR_BRANDS, AD_LIBRARY_SEARCH_TERMS } from '../src/brand.js';

const BASE = 'https://graph.facebook.com/v19.0/ads_archive';

export async function fetchFbAdLibrary(db) {
  const token = process.env.META_ACCESS_TOKEN;

  if (!token) {
    console.warn('[FbAdLibrary] Missing META_ACCESS_TOKEN — skipping');
    return 0;
  }

  console.log('[FbAdLibrary] Fetching competitor ads...');

  const today = new Date().toISOString().slice(0, 10);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO inspiration
      (source, brand_name, ad_url, thumbnail_url, description, format, hook_type, fetched_date)
    VALUES
      ('fb_library', ?, ?, ?, ?, ?, ?, ?)
  `);

  let totalSaved = 0;

  // Search by competitor brand name
  for (const brand of COMPETITOR_BRANDS) {
    try {
      const resp = await axios.get(BASE, {
        params: {
          access_token: token,
          search_page_ids: '',         // we use search_terms instead
          search_terms: brand,
          ad_type: 'ALL',
          ad_reached_countries: '["AU","US","GB","CA"]',
          ad_active_status: 'ACTIVE',
          fields: [
            'id',
            'page_name',
            'ad_snapshot_url',
            'ad_creative_bodies',
            'ad_creative_link_titles',
            'ad_creative_link_descriptions',
            'impressions'
          ].join(','),
          limit: 5           // 5 ads per competitor brand
        }
      });

      const ads = resp.data?.data ?? [];

      for (const ad of ads) {
        const body = ad.ad_creative_bodies?.[0] ?? '';
        const headline = ad.ad_creative_link_titles?.[0] ?? '';
        const description = [headline, body].filter(Boolean).join(' — ').slice(0, 500);
        const hookType = classifyHook(body, headline);

        const saved = insert.run(
          ad.page_name ?? brand,
          ad.ad_snapshot_url ?? '',
          '',                      // no direct thumbnail from library; use snapshot URL
          description,
          'UNKNOWN',
          hookType,
          today
        );
        if (saved.changes > 0) totalSaved++;
      }

      // Small delay to avoid rate limits
      await sleep(300);

    } catch (err) {
      const msg = err.response?.data?.error?.message ?? err.message;
      console.warn(`[FbAdLibrary] Error fetching "${brand}":`, msg);
    }
  }

  // Also search by generic hair loss terms
  for (const term of AD_LIBRARY_SEARCH_TERMS.slice(0, 3)) {
    try {
      const resp = await axios.get(BASE, {
        params: {
          access_token: token,
          search_terms: term,
          ad_type: 'ALL',
          ad_reached_countries: '["AU"]',
          ad_active_status: 'ACTIVE',
          fields: 'id,page_name,ad_snapshot_url,ad_creative_bodies,ad_creative_link_titles',
          limit: 5
        }
      });

      const ads = resp.data?.data ?? [];

      for (const ad of ads) {
        const body = ad.ad_creative_bodies?.[0] ?? '';
        const headline = ad.ad_creative_link_titles?.[0] ?? '';
        const description = [headline, body].filter(Boolean).join(' — ').slice(0, 500);

        const saved = insert.run(
          ad.page_name ?? 'Unknown',
          ad.ad_snapshot_url ?? '',
          '',
          description,
          'UNKNOWN',
          classifyHook(body, headline),
          today
        );
        if (saved.changes > 0) totalSaved++;
      }

      await sleep(300);

    } catch (err) {
      console.warn(`[FbAdLibrary] Error fetching term "${term}":`, err.message);
    }
  }

  console.log(`[FbAdLibrary] Saved ${totalSaved} new inspiration items`);
  return totalSaved;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function classifyHook(body, headline) {
  const text = `${headline} ${body}`.toLowerCase();

  if (/before.?after|transformation|result/i.test(text)) return 'Before/After';
  if (/doctor|dermatolog|specialist|prescribed|clinically/i.test(text)) return 'Social Proof (Clinical)';
  if (/\d+%|\d+ men|\d+ people|study|trial/i.test(text)) return 'Statistics';
  if (/free|no cost|trial|\$0|save \$|off$/i.test(text)) return 'Offer/Discount';
  if (/how i|my hair|i tried|personal/i.test(text)) return 'Personal Story';
  if (/stop|prevent|reverse|fight|combat/i.test(text)) return 'Problem Agitation';
  if (/new|introducing|launch|first ever/i.test(text)) return 'New Product';
  if (/why|secret|truth|mistake|myth/i.test(text)) return 'Curiosity / Contrarian';
  return 'Direct';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
