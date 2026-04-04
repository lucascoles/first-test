/**
 * XYON Health Ad Generator
 *
 * Usage:
 *   FAL_KEY=<your-key> node index.js
 *
 * Generates ad creatives for each XYON product across all ad formats,
 * ensuring consistent product integration and brand identity in every image.
 */

import { fal } from "@fal-ai/client";
import { PRODUCTS, AD_FORMATS } from "./src/brand.js";
import { generateAdBatch } from "./src/generateAd.js";

// Configure fal.ai with your API key
fal.config({ credentials: process.env.FAL_KEY });

// ── Define the jobs: which products × which formats to generate ──────────────

const jobs = [
  // Hero product across primary social formats
  {
    product: PRODUCTS.topicalCombo,
    format: AD_FORMATS.instagramFeed,
    opts: {
      hook: "One gel. Two proven actives. Real results.",
      cta: "Get your prescription at XYONHealth.com",
      audience: "men 25-45 with early to moderate hair loss",
    },
  },
  {
    product: PRODUCTS.topicalCombo,
    format: AD_FORMATS.instagramStory,
    opts: {
      hook: "Doctor-formulated. Clinically targeted.",
      cta: "Swipe up → Free consultation",
    },
  },
  {
    product: PRODUCTS.topicalFinasteride,
    format: AD_FORMATS.facebookFeed,
    opts: {
      hook: "Finasteride — without the systemic risk.",
      cta: "Learn how SiloxysSystem™ works",
    },
  },
  // OTC haircare line
  {
    product: PRODUCTS.dhtShampoo,
    format: AD_FORMATS.instagramFeed,
    opts: {
      hook: "Your shampoo should work as hard as you do.",
      cta: "Shop DHT-Blocking Shampoo",
      mood: "fresh, energetic, clean bathroom aesthetic",
    },
  },
  // Display retargeting
  {
    product: PRODUCTS.topicalDutasteride,
    format: AD_FORMATS.displayRectangle,
    opts: {
      hook: "Stronger DHT blockade. Same trusted gel.",
      cta: "Continue to XYON Health",
      mood: "minimal, high-contrast, urgent",
    },
  },
];

// ── Run ───────────────────────────────────────────────────────────────────────

console.log(`XYON Health Ad Generator`);
console.log(`Generating ${jobs.length} creatives...\n`);

const results = await generateAdBatch(jobs);

console.log(`\nDone. ${results.length} creative(s) generated:\n`);
for (const r of results) {
  console.log(`  [${r.format}] ${r.product}`);
  console.log(`  ${r.url}\n`);
}
