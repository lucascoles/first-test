/**
 * Reddit Inspiration — Best-effort promoted post scraper.
 *
 * Reddit does not have a public ad library.
 * Strategy: search relevant subreddits for promoted/trending posts
 * about hair loss topics and save them as organic inspiration.
 */

import axios from 'axios';

const REDDIT_SEARCH_URL = 'https://www.reddit.com/search.json';

const SEARCH_QUERIES = [
  'hair loss treatment',
  'finasteride topical',
  'minoxidil results',
  'hair restoration',
  'DHT blocker',
];

const SUBREDDITS_TO_CHECK = [
  'HairLoss',
  'tressless',
  'malepatternbaldness',
];

/**
 * Search Reddit for posts matching a query.
 */
async function searchReddit(query, limit = 10) {
  try {
    const res = await axios.get(REDDIT_SEARCH_URL, {
      params: {
        q: query,
        sort: 'relevance',
        t: 'week',
        limit,
        type: 'link',
      },
      headers: {
        'User-Agent': 'XyonCommandCentre/1.0'
      }
    });

    return (res.data?.data?.children || []).map(c => c.data);
  } catch (err) {
    console.warn(`[reddit-ads] Search failed for "${query}":`, err.message);
    return [];
  }
}

/**
 * Fetch hot posts from a specific subreddit.
 */
async function fetchSubredditHot(subreddit, limit = 10) {
  try {
    const res = await axios.get(`https://www.reddit.com/r/${subreddit}/hot.json`, {
      params: { limit },
      headers: {
        'User-Agent': 'XyonCommandCentre/1.0'
      }
    });

    return (res.data?.data?.children || []).map(c => c.data);
  } catch (err) {
    console.warn(`[reddit-ads] Subreddit fetch failed for r/${subreddit}:`, err.message);
    return [];
  }
}

/**
 * Classify the hook type from post title/body.
 */
function classifyHook(text) {
  if (!text) return 'unknown';
  const lower = text.toLowerCase();
  if (lower.includes('before') && lower.includes('after')) return 'before_after';
  if (lower.includes('result') || lower.includes('progress')) return 'transformation';
  if (lower.includes('?')) return 'question';
  if (lower.includes('review') || lower.includes('experience')) return 'testimonial';
  if (lower.includes('doctor') || lower.includes('study')) return 'authority';
  return 'general';
}

/**
 * Fetch Reddit inspiration (promoted posts + trending organic) and save to the database.
 *
 * @param {import('better-sqlite3').Database} db
 */
export async function fetchRedditInspiration(db) {
  console.log('[reddit-ads] Fetching Reddit inspiration...');

  const today = new Date().toISOString().slice(0, 10);

  const insert = db.prepare(`
    INSERT INTO inspiration (source, brand_name, ad_url, thumbnail_url, description, format, hook_type, fetched_date)
    VALUES (?, ?, ?, ?, ?, 'IMAGE', ?, ?)
    ON CONFLICT(ad_url) DO UPDATE SET fetched_date = excluded.fetched_date
  `);

  let saved = 0;

  // 1. Search for promoted/relevant posts
  for (const query of SEARCH_QUERIES) {
    const posts = await searchReddit(query, 5);
    for (const post of posts) {
      const url = `https://www.reddit.com${post.permalink}`;
      const source = post.promoted ? 'reddit_promoted' : 'reddit_organic';

      insert.run(
        source,
        post.author || 'Unknown',
        url,
        post.thumbnail && post.thumbnail.startsWith('http') ? post.thumbnail : '',
        (post.title || '').slice(0, 500),
        classifyHook(post.title || ''),
        today
      );
      saved++;
    }
  }

  // 2. Check relevant subreddits for trending posts
  for (const sub of SUBREDDITS_TO_CHECK) {
    const posts = await fetchSubredditHot(sub, 5);
    for (const post of posts) {
      const url = `https://www.reddit.com${post.permalink}`;

      insert.run(
        'reddit_organic',
        post.author || 'Unknown',
        url,
        post.thumbnail && post.thumbnail.startsWith('http') ? post.thumbnail : '',
        (post.title || '').slice(0, 500),
        classifyHook(post.title || ''),
        today
      );
      saved++;
    }
  }

  console.log(`[reddit-ads] Saved ${saved} inspiration posts.`);
}
