// scheduler.js
// Daily automation: runs all scrapers, analysis, and inspiration fetching.
// Imported by server.js when the server starts.
// Jobs run at 6:00am every day.

import cron from 'node-cron';
import { syncMetaAds }       from './scrapers/meta.js';
import { syncTikTokAds }     from './scrapers/tiktok.js';
import { syncRedditAds }     from './scrapers/reddit.js';
import { scoreAllFatigue }   from './analysis/fatigue.js';
import { generateSuggestions } from './analysis/suggestions.js';
import { fetchFbAdLibrary }  from './inspiration/fb-ad-library.js';
import { fetchTikTokTrending } from './inspiration/tiktok-creative.js';
import { fetchRedditInsights } from './inspiration/reddit-ads.js';

// Run the full daily sync pipeline
export async function runDailySync(db) {
  const start = Date.now();
  console.log('\n══════════════════════════════════════════');
  console.log('  XYON Command Centre — Daily Sync Start');
  console.log('  ' + new Date().toLocaleString());
  console.log('══════════════════════════════════════════\n');

  const results = {};

  // ── 1. Scrape ad accounts ──────────────────────────────────────────────────
  console.log('Step 1/5: Syncing ad accounts...');
  results.meta   = await syncMetaAds(db);
  results.tiktok = await syncTikTokAds(db);
  results.reddit = await syncRedditAds(db);

  // ── 2. Score fatigue ───────────────────────────────────────────────────────
  console.log('\nStep 2/5: Scoring creative fatigue...');
  results.fatigueScored = scoreAllFatigue(db);

  // ── 3. Generate suggestions ────────────────────────────────────────────────
  console.log('\nStep 3/5: Generating suggestions...');
  results.suggestions = generateSuggestions(db);

  // ── 4. Fetch competitor inspiration ───────────────────────────────────────
  console.log('\nStep 4/5: Fetching competitor inspiration (Facebook Ad Library)...');
  results.fbLibrary = await fetchFbAdLibrary(db);

  console.log('\nStep 5/5: Fetching TikTok trends + Reddit insights...');
  results.tiktokTrending = await fetchTikTokTrending(db);
  results.redditInsights = await fetchRedditInsights(db);

  // ── Summary ────────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('\n══════════════════════════════════════════');
  console.log(`  Daily Sync Complete in ${elapsed}s`);
  console.log(`  Meta ads: ${results.meta?.synced ?? 0} | TikTok: ${results.tiktok?.synced ?? 0} | Reddit: ${results.reddit?.synced ?? 0}`);
  console.log(`  Fatigue scored: ${results.fatigueScored} | Suggestions: ${results.suggestions}`);
  console.log(`  Inspiration: FB +${results.fbLibrary} | TikTok +${results.tiktokTrending} | Reddit +${results.redditInsights}`);
  console.log('══════════════════════════════════════════\n');

  return results;
}

// Register the cron job — runs every day at 6:00am
export function startScheduler(db) {
  cron.schedule('0 6 * * *', async () => {
    await runDailySync(db);
  });

  console.log('[Scheduler] Daily sync scheduled for 6:00am every day');
}
