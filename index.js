/**
 * XYON Health Ad Generator — powered by Nano Banana 2 (fal-ai/nano-banana-2)
 *
 * Usage:
 *   # Standard batch (5 ads across formats):
 *   FAL_KEY=<your-key> node index.js
 *
 *   # 100 systematic variations of the hero product on Instagram Feed:
 *   FAL_KEY=<your-key> node index.js --variations
 *
 * Nano Banana 2 uses thinking_level:"high" by default for cinematic output.
 * Every creative embeds real XYON product identity — no generic stock imagery.
 */

import { fal } from "@fal-ai/client";
import { PRODUCTS, AD_FORMATS } from "./src/brand.js";
import { generateAdBatch, generateVariations } from "./src/generateAd.js";

fal.config({ credentials: process.env.FAL_KEY });

// ── Copy matrix for 100-variation run ────────────────────────────────────────
// 10 hooks × 10 CTAs = 100 unique copy permutations, each with a unique seed.

const HOOKS = [
  "One gel. Two proven actives. Real results.",
  "Doctor-formulated. Clinically targeted.",
  "Stop hair loss before it gets worse.",
  "Finasteride — without the systemic risk.",
  "The new standard in treating hair loss.",
  "Backed by dermatologists. Built for results.",
  "Your hair loss has a prescription. Now it has a gel.",
  "SiloxysSystem™: precision where it counts.",
  "Start your treatment in minutes. See results in months.",
  "Hair loss is treatable. Start today.",
];

const CTAS = [
  "Get your prescription at XYONHealth.com",
  "Start your free consultation",
  "Shop XYON Health — from $99/month",
  "Talk to a hair restoration specialist",
  "See if you qualify — free online visit",
  "Try SiloxysSystem™ risk-free",
  "Free discreet shipping. Start now.",
  "Prescribed online. Delivered to your door.",
  "Join thousands treating hair loss with XYON",
  "Take the hair loss quiz at XYONHealth.com",
];

// ── Mood matrix (10 moods × 10 = 100 visual styles) ─────────────────────────

const MOODS = [
  "clean minimal studio, soft white backlight, matte charcoal surface",
  "cinematic dark gradient, warm rim light, luxury product photography",
  "clinical lab aesthetic, cool white light, precise and modern",
  "warm morning bathroom counter, natural window light, lifestyle feel",
  "editorial close-up, extreme depth of field, bokeh background",
  "bold graphic, high contrast charcoal and white, typographic focus",
  "premium skincare shelf, ambient soft glow, aspirational lifestyle",
  "dark moody spa setting, candlelight warmth, sophisticated",
  "clean e-commerce flat lay, overhead shot, crisp shadows",
  "avant-garde fragrance-ad style, dramatic lighting, artistic",
];

// ── Mode detection ────────────────────────────────────────────────────────────

const runVariations = process.argv.includes("--variations");

if (runVariations) {
  // ── 100-variation run ─────────────────────────────────────────────────────
  console.log("XYON Health — 100-Variation Generator (Nano Banana 2)\n");
  console.log("Product : Topical Finasteride + Minoxidil Gel (hero product)");
  console.log("Format  : Instagram Feed 1:1");
  console.log("Model   : fal-ai/nano-banana-2 | thinking_level: high\n");

  const results = await generateVariations(
    PRODUCTS.topicalCombo,
    AD_FORMATS.instagramFeed,
    { hooks: HOOKS, ctas: CTAS },
    MOODS,
    100,
    { thinkingLevel: "high", resolution: "1K" }
  );

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Done. ${results.length} creatives generated.\n`);
  for (const r of results) {
    console.log(`  [${String(r.variationIndex).padStart(3, "0")}] seed:${r.seed} ${r.url}`);
  }

} else {
  // ── Standard batch run (5 ads across products × formats) ─────────────────
  console.log("XYON Health Ad Generator — Nano Banana 2\n");

  const jobs = [
    {
      product: PRODUCTS.topicalCombo,
      format: AD_FORMATS.instagramFeed,
      opts: {
        hook: "One gel. Two proven actives. Real results.",
        cta: "Get your prescription at XYONHealth.com",
        audience: "men 25–45 with early to moderate hair loss",
        mood: MOODS[1],
      },
    },
    {
      product: PRODUCTS.topicalCombo,
      format: AD_FORMATS.instagramStory,
      opts: {
        hook: "Doctor-formulated. Clinically targeted.",
        cta: "Swipe up → Free consultation",
        mood: MOODS[0],
      },
    },
    {
      product: PRODUCTS.topicalFinasteride,
      format: AD_FORMATS.facebookFeed,
      opts: {
        hook: "Finasteride — without the systemic risk.",
        cta: "Learn how SiloxysSystem™ works",
        mood: MOODS[2],
      },
    },
    {
      product: PRODUCTS.dhtShampoo,
      format: AD_FORMATS.instagramFeed,
      opts: {
        hook: "Your shampoo should work as hard as you do.",
        cta: "Shop DHT-Blocking Shampoo",
        mood: MOODS[6],
      },
    },
    {
      product: PRODUCTS.topicalDutasteride,
      format: AD_FORMATS.displayRectangle,
      opts: {
        hook: "Stronger DHT blockade. Same trusted gel.",
        cta: "Continue to XYON Health",
        mood: MOODS[5],
      },
    },
  ];

  console.log(`Generating ${jobs.length} creatives with thinking_level: high...\n`);
  const results = await generateAdBatch(jobs);

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Done. ${results.length} creative(s) generated:\n`);
  for (const r of results) {
    console.log(`  [${r.format}] ${r.product}`);
    console.log(`  ${r.url}\n`);
  }
}
