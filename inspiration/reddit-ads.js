// inspiration/reddit-ads.js
// Reddit has no public ad library.
// Strategy: search hair-loss-related subreddits for top organic posts
// that could inspire ad creative concepts.
// Read-only. No ads are created or modified.

import axios from 'axios';

const REDDIT_BASE = 'https://www.reddit.com';

// Subreddits relevant to Xyon's target audience
const SUBREDDITS = [
  'HairLoss',
  'tressless',       // popular hair loss community
  'malepatternbald',
  'finasteride',
  'minoxidil',
  'Alopecia_alopeciaalopecia'
];

export async function fetchRedditInsights(db) {
  console.log('[RedditInsights] Fetching subreddit inspiration...');

  const today = new Date().toISOString().slice(0, 10);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO inspiration
      (source, brand_name, ad_url, thumbnail_url, description, format, hook_type, fetched_date)
    VALUES
      ('reddit_organic', ?, ?, ?, ?, ?, ?, ?)
  `);

  let totalSaved = 0;

  for (const sub of SUBREDDITS) {
    try {
      // Get the top posts from the last week — these represent what resonates with the audience
      const resp = await axios.get(`${REDDIT_BASE}/r/${sub}/top.json`, {
        params: { t: 'week', limit: 5 },
        headers: { 'User-Agent': 'XyonCommandCentre/1.0 (inspiration reader)' },
        timeout: 8000
      });

      const posts = resp.data?.data?.children ?? [];

      for (const { data: post } of posts) {
        // Only include posts with meaningful engagement
        if (post.score < 10) continue;
        if (post.is_self && !post.selftext) continue;

        const title = post.title ?? '';
        const text  = (post.selftext ?? '').slice(0, 300);
        const description = `[r/${sub}] ${title}${text ? ' — ' + text : ''}`.slice(0, 500);
        const hookType = classifyRedditPost(title, text, post);

        const saved = insert.run(
          `r/${sub}`,
          `https://reddit.com${post.permalink}`,
          post.thumbnail !== 'self' && post.thumbnail !== 'default' ? (post.thumbnail ?? '') : '',
          description,
          post.is_video ? 'VIDEO' : 'IMAGE',
          hookType,
          today
        );
        if (saved.changes > 0) totalSaved++;
      }

      await sleep(400);   // be polite to Reddit's API

    } catch (err) {
      console.warn(`[RedditInsights] Could not fetch r/${sub}:`, err.message);
    }
  }

  console.log(`[RedditInsights] Saved ${totalSaved} new inspiration items`);
  return totalSaved;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function classifyRedditPost(title, text, post) {
  const combined = `${title} ${text}`.toLowerCase();

  if (/before.?after|progress photo|month \d+|update/i.test(combined)) return 'Journey / Progress';
  if (/question|ask|help|advice/i.test(combined)) return 'Pain Point / Question';
  if (/success|work|result|finally|it worked/i.test(combined)) return 'Success Story';
  if (/side effect|worried|scared|experience/i.test(combined)) return 'Fear / Concern';
  if (/routine|regimen|stack|protocol/i.test(combined)) return 'Educational / Routine';
  if (/comparison|vs|versus|better than/i.test(combined)) return 'Comparison';
  if (/cost|price|afford|cheap|expensive/i.test(combined)) return 'Pricing / Value';
  return 'Community Insight';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
