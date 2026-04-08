/**
 * Facebook Ad Library — Public API scraper.
 *
 * Searches the public Facebook Ad Library for competitor ads
 * in Xyon Health's market (hair loss, finasteride, etc.).
 *
 * Uses META_ACCESS_TOKEN for authentication (same token as Marketing API).
 */

import axios from 'axios';

const AD_LIBRARY_URL = 'https://graph.facebook.com/v19.0/ads_archive';

// Competitor brands to monitor (also exported from src/brand.js)
const DEFAULT_SEARCH_TERMS = [
  'hair loss finasteride',
  'hair loss treatment',
  'Keeps hair',
  'Hims hair',
  'Manual hair loss',
  'Pilot hair',
  'topical finasteride',
];

const TARGET_COUNTRIES = ['AU', 'US'];

/**
 * Search the Facebook Ad Library for ads matching a search term.
 */
async function searchAdLibrary(token, searchTerm, limit = 10) {
  try {
    const res = await axios.get(AD_LIBRARY_URL, {
      params: {
        search_terms: searchTerm,
        ad_type: 'ALL',
        ad_reached_countries: TARGET_COUNTRIES.join(','),
        fields: 'id,ad_creative_bodies,ad_creative_link_titles,ad_snapshot_url,page_name',
        access_token: token,
        limit
      }
    });
    return res.data?.data || [];
  } catch (err) {
    console.warn(`[fb-ad-library] Search failed for "${searchTerm}":`, err.message);
    return [];
  }
}

/**
 * Guess the hook type from ad copy.
 */
function classifyHook(body) {
  if (!body) return 'unknown';
  const lower = body.toLowerCase();
  if (lower.includes('before') && lower.includes('after')) return 'before_after';
  if (lower.includes('doctor') || lower.includes('clinically')) return 'authority';
  if (lower.includes('% off') || lower.includes('discount') || lower.includes('free')) return 'offer';
  if (lower.includes('?')) return 'question';
  if (lower.includes('results') || lower.includes('worked')) return 'testimonial';
  if (lower.includes('new') || lower.includes('introducing')) return 'launch';
  return 'general';
}

/**
 * Fetch competitor ads from the Facebook Ad Library and save to the database.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string[]} [searchTerms] - Custom search terms (defaults to competitor brands)
 */
export async function fetchFbAdLibrary(db, searchTerms) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    console.log('[fb-ad-library] Skipping — META_ACCESS_TOKEN not set.');
    return;
  }

  const terms = searchTerms || DEFAULT_SEARCH_TERMS;
  const today = new Date().toISOString().slice(0, 10);

  console.log(`[fb-ad-library] Searching ${terms.length} terms...`);

  const insert = db.prepare(`
    INSERT INTO inspiration (source, brand_name, ad_url, thumbnail_url, description, format, hook_type, fetched_date)
    VALUES ('fb_library', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ad_url) DO UPDATE SET fetched_date = excluded.fetched_date
  `);

  let saved = 0;
  for (const term of terms) {
    const ads = await searchAdLibrary(token, term, 5);

    for (const ad of ads) {
      const body = (ad.ad_creative_bodies || []).join(' ');
      const title = (ad.ad_creative_link_titles || []).join(' ');
      const url = ad.ad_snapshot_url || '';
      if (!url) continue;

      insert.run(
        ad.page_name || 'Unknown',
        url,
        '', // Facebook Ad Library doesn't provide direct thumbnails in this endpoint
        (body || title).slice(0, 500),
        'IMAGE', // Default — library doesn't specify
        classifyHook(body || title),
        today
      );
      saved++;
    }
  }

  console.log(`[fb-ad-library] Saved ${saved} inspiration ads.`);
}
