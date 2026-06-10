/**
 * Organic Reddit Listening — READ-ONLY social listening.
 *
 * Scans Reddit (site-wide search + chosen subreddits + recent comments) for
 * conversations about topical finasteride / dutasteride, sourcing questions,
 * competitor comparisons, and direct XYON mentions. Stores matches with
 * direct permalinks so a human can review and reply manually.
 *
 * This module NEVER posts, votes, messages, or writes anything to Reddit.
 * It only reads public listings via the official Reddit OAuth API.
 *
 * Required env vars:
 *   REDDIT_SCAN_CLIENT_ID   — client id of a Reddit "script" app
 *   REDDIT_SCAN_SECRET      — that app's secret
 *   REDDIT_USER_AGENT       — e.g. "xyon-listener/1.0 by u/yourname"
 *
 * Create the app at https://www.reddit.com/prefs/apps (type: "script").
 */

import axios from 'axios';

const AUTH_URL = 'https://www.reddit.com/api/v1/access_token';
const API_BASE = 'https://oauth.reddit.com';
const PUBLIC_BASE = 'https://www.reddit.com';

// ---------------------------------------------------------------------------
// Configuration — edit these to tune what the scanner watches.
// ---------------------------------------------------------------------------

/** Subreddits to search directly (in addition to a site-wide search). */
export const SUBREDDITS = [
  'tressless',
  'Hairloss',
  'HaircareScience',
  'FinasterideSyndrome',
];

/** Search phrases. Each is run as a Reddit search query, newest-first. */
export const SEARCH_TERMS = [
  'topical finasteride',
  'topical dutasteride',
  'topical dut',
  'topical fin',
  'compounded finasteride',
  'compounded dutasteride',
  'where to get topical',
  'xyon',
];

/** How far back each scan looks. Reddit search `t` window. */
const TIME_WINDOW = 'week'; // hour | day | week | month | year | all
const PER_QUERY_LIMIT = 100;

// Lowercased keyword groups used for matching + scoring against any text.
const TERM_GROUPS = {
  topical:     ['topical fin', 'topical dut', 'topical finasteride', 'topical dutasteride',
                'compounded fin', 'compounded dut', 'topical minoxidil', 'topical'],
  drug:        ['finasteride', 'dutasteride', 'fin', 'dut', 'minoxidil', 'min'],
  brand:       ['xyon'],
  competitor:  ['happy head', 'happyhead', 'hims', 'keeps', 'roman', 'strut', 'agency',
                'minoxidilmax', 'minoxidil max', 'essential clinic'],
};

// Intent detection. First matching group (in this order) wins.
const INTENT_PATTERNS = [
  ['brand',      [/\bxyon\b/i]],
  ['sourcing',   [
    /where\s+(can|do|to|could|would|should)\s+.{0,20}(get|buy|order|source|purchase|find)/i,
    /where('?s| is| can i| do i| to)\b.{0,30}(topical|compounded|dut|fin|prescription)/i,
    /\b(legit|legitimate|reputable|trusted|reliable)\s+(source|pharmacy|site|vendor|seller)/i,
    /\b(online )?(pharmacy|telehealth|clinic|service)\b.{0,30}(topical|dut|fin|prescription|recommend)/i,
    /\bhow (do|can) (i|you)\s+.{0,20}(get|obtain|source|order)/i,
    /\b(prescri\w+|rx)\b.{0,30}(topical|dut|fin|online|where)/i,
    /\bany(one|body)\s+(know|recommend).{0,30}(source|pharmacy|where|get)/i,
  ]],
  ['comparison', [
    /\bvs\.?\b/i, /\bversus\b/i, /\bbetter than\b/i, /\balternative(s)? to\b/i,
    /\bcompared? to\b/i, /\bwhich (is|one)\b.{0,20}(better|best)/i,
  ]],
  ['experience', [
    /\b\d+\s*(month|week|year)s?\b/i, /\bside ?effects?\b/i, /\bshed(ding)?\b/i,
    /\bresults?\b/i, /\bmy (regimen|routine|stack)\b/i, /\bprogress\b/i,
  ]],
];

// ---------------------------------------------------------------------------
// Reddit API helpers
// ---------------------------------------------------------------------------

async function getAppToken(clientId, clientSecret, userAgent) {
  const res = await axios.post(AUTH_URL, 'grant_type=client_credentials', {
    auth: { username: clientId, password: clientSecret },
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
  });
  return res.data.access_token;
}

function authedClient(token, userAgent) {
  return axios.create({
    baseURL: API_BASE,
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': userAgent },
    timeout: 20000,
  });
}

// Unauthenticated fallback: Reddit's public .json endpoints. No app or
// credentials required — only a descriptive User-Agent — at the cost of lower
// rate limits. Lets the scanner work when you can't create a Reddit app.
function publicClient(userAgent) {
  return axios.create({
    baseURL: PUBLIC_BASE,
    headers: { 'User-Agent': userAgent },
    timeout: 20000,
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET a Reddit listing, tolerating transient errors / rate limits.
 *  `suffix` is '.json' in unauthenticated mode, '' when using OAuth. */
async function getListing(api, path, params, suffix = '') {
  try {
    const res = await api.get(`${path}${suffix}`, { params: { raw_json: 1, ...params } });
    return res.data?.data?.children || [];
  } catch (err) {
    const code = err.response?.status;
    if (code === 429) {
      console.warn(`[reddit-listen] Rate limited on ${path} — backing off 8s.`);
      await sleep(8000);
      return [];
    }
    console.warn(`[reddit-listen] GET ${path} failed (${code || err.message}).`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Matching, intent, and scoring
// ---------------------------------------------------------------------------

/** Return the list of keyword groups + raw terms that appear in `text`. */
export function matchTerms(text) {
  const hay = (text || '').toLowerCase();
  const hits = new Set();
  for (const [group, terms] of Object.entries(TERM_GROUPS)) {
    for (const t of terms) {
      // word-ish boundary so "fin" doesn't match "finally"
      const re = new RegExp(`(^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i');
      if (re.test(hay)) { hits.add(t); break; }
    }
  }
  return [...hits];
}

function classifyIntent(text) {
  for (const [intent, patterns] of INTENT_PATTERNS) {
    if (patterns.some((re) => re.test(text || ''))) return intent;
  }
  return 'general';
}

/**
 * Relevance 0-100. Prioritises sourcing questions (people literally asking
 * where to buy), brand mentions, then comparisons, weighted by recency and
 * how much the post mentions topical treatments specifically.
 */
function scoreRelevance({ intent, matchedTerms, createdUtc, score, numComments, kind }) {
  let s = 0;

  const intentWeight = { sourcing: 55, brand: 45, comparison: 30, experience: 15, general: 5 };
  s += intentWeight[intent] ?? 5;

  // Topical/brand mentions are the sweet spot for XYON.
  if (matchedTerms.some((t) => t.includes('topical') || t.includes('compounded'))) s += 18;
  if (matchedTerms.includes('xyon')) s += 12;
  if (matchedTerms.some((t) => TERM_GROUPS.competitor.includes(t))) s += 8;

  // Recency: full credit < 1 day, decaying to ~0 at 14 days.
  const ageDays = (Date.now() / 1000 - (createdUtc || 0)) / 86400;
  s += Math.max(0, 14 - ageDays) / 14 * 12;

  // A little signal for visibility, capped so big threads don't dominate.
  s += Math.min(8, Math.log10((score || 0) + 1) * 4);
  if (kind === 'post') s += Math.min(5, Math.log10((numComments || 0) + 1) * 3);

  return Math.max(0, Math.min(100, Math.round(s)));
}

// ---------------------------------------------------------------------------
// Normalisation of Reddit objects → our row shape
// ---------------------------------------------------------------------------

function normalizePost(child) {
  const d = child.data;
  const text = `${d.title || ''}\n${d.selftext || ''}`;
  const matchedTerms = matchTerms(text);
  const intent = classifyIntent(text);
  return {
    id: d.name, // t3_xxx
    kind: 'post',
    subreddit: d.subreddit,
    author: d.author,
    title: d.title || '',
    body: d.selftext || '',
    permalink: `https://www.reddit.com${d.permalink}`,
    parent_url: `https://www.reddit.com${d.permalink}`,
    score: d.score || 0,
    num_comments: d.num_comments || 0,
    created_utc: Math.round(d.created_utc || 0),
    matchedTerms,
    intent,
    relevance: scoreRelevance({
      intent, matchedTerms, createdUtc: d.created_utc,
      score: d.score, numComments: d.num_comments, kind: 'post',
    }),
  };
}

function normalizeComment(child) {
  const d = child.data;
  const text = d.body || '';
  const matchedTerms = matchTerms(text);
  const intent = classifyIntent(text);
  const threadUrl = d.link_permalink || (d.permalink ? `https://www.reddit.com${d.permalink}` : '');
  return {
    id: d.name, // t1_xxx
    kind: 'comment',
    subreddit: d.subreddit,
    author: d.author,
    title: d.link_title || '',
    body: text,
    permalink: `https://www.reddit.com${d.permalink}`,
    parent_url: threadUrl,
    score: d.score || 0,
    num_comments: 0,
    created_utc: Math.round(d.created_utc || 0),
    matchedTerms,
    intent,
    relevance: scoreRelevance({
      intent, matchedTerms, createdUtc: d.created_utc, score: d.score, kind: 'comment',
    }),
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function upsertMention(db, row) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO reddit_mentions
      (id, kind, subreddit, author, title, body, permalink, parent_url, score,
       num_comments, created_utc, matched_terms, intent, relevance, status,
       first_seen, last_seen)
    VALUES
      (@id, @kind, @subreddit, @author, @title, @body, @permalink, @parent_url, @score,
       @num_comments, @created_utc, @matched_terms, @intent, @relevance, 'new',
       @now, @now)
    ON CONFLICT(id) DO UPDATE SET
      score        = excluded.score,
      num_comments = excluded.num_comments,
      relevance    = excluded.relevance,
      last_seen    = excluded.last_seen
  `);
  stmt.run({
    id: row.id, kind: row.kind, subreddit: row.subreddit, author: row.author,
    title: row.title, body: row.body, permalink: row.permalink, parent_url: row.parent_url,
    score: row.score, num_comments: row.num_comments, created_utc: row.created_utc,
    matched_terms: JSON.stringify(row.matchedTerms), intent: row.intent,
    relevance: row.relevance, now,
  });
}

/** True if a row id is new to the DB (used for accurate new-count). */
function isNew(db, id) {
  return !db.prepare('SELECT 1 FROM reddit_mentions WHERE id = ?').get(id);
}

// ---------------------------------------------------------------------------
// Main scan
// ---------------------------------------------------------------------------

/**
 * Run one full Reddit listening pass.
 * @param {import('better-sqlite3').Database} db
 * @returns {Promise<{queries:number, seen:number, added:number, skipped?:boolean}>}
 */
export async function scanReddit(db) {
  const clientId = process.env.REDDIT_SCAN_CLIENT_ID;
  const clientSecret = process.env.REDDIT_SCAN_SECRET;
  const userAgent = process.env.REDDIT_USER_AGENT || 'xyon-listener/1.0';
  const hasCreds = Boolean(clientId && clientSecret);

  let api;
  let suffix = '';   // appended to each path: '' for OAuth, '.json' for public
  let pace = 700;    // ms between requests; authenticated ceiling is ~60/min
  let mode = 'oauth';

  if (hasCreds) {
    let token;
    try {
      token = await getAppToken(clientId, clientSecret, userAgent);
    } catch (err) {
      console.error('[reddit-listen] Auth failed:', err.response?.status || err.message);
      return { queries: 0, seen: 0, added: 0, skipped: true };
    }
    api = authedClient(token, userAgent);
  } else {
    // No app credentials — use Reddit's public JSON endpoints instead.
    console.log('[reddit-listen] No app credentials — using unauthenticated public JSON (slower, lower rate limits).');
    api = publicClient(userAgent);
    suffix = '.json';
    pace = 4000;      // far gentler to stay under unauthenticated limits
    mode = 'public';
  }

  // Trim the query set in public mode to stay comfortably within rate limits.
  const searchTerms = hasCreds ? SEARCH_TERMS : SEARCH_TERMS.slice(0, 4);

  let queries = 0;
  let seen = 0;
  let added = 0;

  const handleChildren = (children, normalizer) => {
    for (const child of children) {
      const row = normalizer(child);
      if (row.matchedTerms.length === 0) continue; // ignore pure noise
      seen++;
      if (isNew(db, row.id)) added++;
      upsertMention(db, row);
    }
  };

  // 1) Per-subreddit keyword search (posts).
  for (const sub of SUBREDDITS) {
    for (const term of searchTerms) {
      const children = await getListing(api, `/r/${sub}/search`, {
        q: term, restrict_sr: 1, sort: 'new', t: TIME_WINDOW, limit: PER_QUERY_LIMIT, type: 'link',
      }, suffix);
      handleChildren(children, normalizePost);
      queries++;
      await sleep(pace);
    }

    // 2) Recent comments in the sub, keyword-filtered locally.
    const comments = await getListing(api, `/r/${sub}/comments`, { limit: PER_QUERY_LIMIT }, suffix);
    handleChildren(comments, normalizeComment);
    queries++;
    await sleep(pace);
  }

  // 3) Site-wide search for the highest-signal terms (catches other subs).
  for (const term of ['topical dutasteride', 'topical finasteride', 'xyon']) {
    const children = await getListing(api, `/search`, {
      q: term, sort: 'new', t: TIME_WINDOW, limit: PER_QUERY_LIMIT, type: 'link',
    }, suffix);
    handleChildren(children, normalizePost);
    queries++;
    await sleep(pace);
  }

  db.prepare(`
    INSERT INTO reddit_scan_log (ran_at, queries_run, items_seen, new_mentions, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(new Date().toISOString(), queries, seen, added,
        `mode=${mode} subs=${SUBREDDITS.length} terms=${searchTerms.length}`);

  console.log(`[reddit-listen] Scan complete — ${queries} queries, ${seen} matches, ${added} new.`);
  return { queries, seen, added };
}
