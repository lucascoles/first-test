/**
 * XYON Command Centre — Daily Scheduler.
 *
 * Uses node-cron to run data sync, fatigue scoring,
 * suggestions generation, and inspiration fetching daily at 6am.
 */

import cron from 'node-cron';
import { syncMetaAds } from './scrapers/meta.js';
import { syncTikTokAds } from './scrapers/tiktok.js';
import { syncRedditAds } from './scrapers/reddit.js';
import { scoreAllFatigue } from './analysis/fatigue.js';
import { generateSuggestions } from './analysis/suggestions.js';
import { fetchFbAdLibrary } from './inspiration/fb-ad-library.js';
import { fetchTikTokCreative } from './inspiration/tiktok-creative.js';
import { fetchRedditInspiration } from './inspiration/reddit-ads.js';
import { scanReddit } from './scanners/reddit-listen.js';

/**
 * Run the full daily sync pipeline.
 *
 * @param {import('better-sqlite3').Database} db
 */
export async function runFullSync(db) {
  const start = Date.now();
  console.log('=== Daily sync started ===');

  try {
    // 1. Scrape all platforms
    console.log('\n--- Platform Scrapers ---');
    await syncMetaAds(db);
    await syncTikTokAds(db);
    await syncRedditAds(db);

    // 2. Run analysis
    console.log('\n--- Analysis ---');
    scoreAllFatigue(db);
    generateSuggestions(db);

    // 3. Fetch inspiration
    console.log('\n--- Inspiration ---');
    await fetchFbAdLibrary(db);
    await fetchTikTokCreative(db);
    await fetchRedditInspiration(db);

  } catch (err) {
    console.error('Sync pipeline error:', err.message);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=== Daily sync complete (${elapsed}s) ===`);
}

/**
 * Start the daily cron schedule.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function startScheduler(db) {
  // Run daily at 6:00 AM local time
  cron.schedule('0 6 * * *', async () => {
    await runFullSync(db);
  });

  // Organic Reddit listening — every 2 days at 8:00 AM ("every few days").
  cron.schedule('0 8 */2 * *', async () => {
    console.log('\n--- Reddit Listening Scan ---');
    try {
      await scanReddit(db);
    } catch (err) {
      console.error('[reddit-listen] Scan error:', err.message);
    }
  });

  console.log('[scheduler] Daily sync scheduled for 6:00 AM.');
  console.log('[scheduler] Reddit listening scan scheduled every 2 days at 8:00 AM.');
}
