import { fal } from "@fal-ai/client";
import { buildAdPrompt } from "./buildPrompt.js";

const DEFAULT_MODEL = "fal-ai/nano-banana-2";

/**
 * Generate a single ad creative via Nano Banana 2.
 *
 * @param {object} product   - PRODUCTS entry from brand.js
 * @param {object} format    - AD_FORMATS entry from brand.js
 * @param {object} [opts]    - Prompt overrides: { hook, cta, audience, mood }
 * @param {object} [falOpts] - fal.ai overrides: { model, numImages, seed, thinkingLevel, resolution }
 * @returns {Promise<object[]>}
 */
export async function generateAd(product, format, opts = {}, falOpts = {}) {
  const {
    model = DEFAULT_MODEL,
    numImages = 1,
    seed = undefined,
    thinkingLevel = "high",  // "high" → cinematic reasoning pass before render
    resolution = format.resolution ?? "1K",
    outputFormat = "png",
  } = falOpts;

  const { prompt } = buildAdPrompt(product, format, opts);

  const result = await fal.subscribe(model, {
    input: {
      prompt,
      aspect_ratio: format.aspectRatio,
      resolution,
      num_images: numImages,
      output_format: outputFormat,
      thinking_level: thinkingLevel,
      ...(seed !== undefined && { seed }),
    },
    logs: true,
    onQueueUpdate(update) {
      if (update.status === "IN_PROGRESS") {
        const latest = update.logs?.at(-1)?.message;
        if (latest) process.stdout.write(`\r  [${product.shortName}] ${latest}      `);
      }
    },
  });

  process.stdout.write("\n");

  return result.data.images.map((img, i) => ({
    url: img.url,
    seed: result.data.seed ?? seed,
    variationIndex: i,
    prompt,
    product: product.id,
    format: format.label,
    aspectRatio: format.aspectRatio,
    resolution,
  }));
}

/**
 * Batch-generate ads for an array of { product, format, opts?, falOpts? } jobs.
 * Runs sequentially to stay within rate limits.
 *
 * @param {object[]} jobs
 * @returns {Promise<object[]>}  Flat array of all generated image results
 */
export async function generateAdBatch(jobs) {
  const results = [];
  for (const job of jobs) {
    console.log(`\nGenerating: ${job.product.shortName} — ${job.format.label}`);
    const images = await generateAd(job.product, job.format, job.opts, job.falOpts);
    results.push(...images);
    console.log(`  ✓ ${images.length} image(s) → ${images[0].url}`);
  }
  return results;
}

/**
 * Systematically generate N variations for a product × format pair.
 *
 * Variations are produced by cycling through:
 *   1. Copy matrix  — combinatorial hook × CTA permutations
 *   2. Mood matrix  — visual mood / lighting styles
 *   3. Seeds        — unique random seed per variation for visual diversity
 *
 * @param {object}   product
 * @param {object}   format
 * @param {object}   copyMatrix  - { hooks: string[], ctas: string[] }
 * @param {object}   moodMatrix  - string[]
 * @param {number}   count       - Total variations to generate (default 100)
 * @param {object}   [falOpts]   - fal.ai overrides
 * @returns {Promise<object[]>}
 */
export async function generateVariations(
  product,
  format,
  copyMatrix,
  moodMatrix,
  count = 100,
  falOpts = {}
) {
  const { hooks, ctas } = copyMatrix;
  const results = [];
  let generated = 0;

  console.log(`\nGenerating ${count} variations: ${product.shortName} — ${format.label}`);

  for (let i = 0; i < count; i++) {
    const hook  = hooks[i % hooks.length];
    const cta   = ctas[i % ctas.length];
    const mood  = moodMatrix[i % moodMatrix.length];
    const seed  = 1000 + i;  // deterministic seeds so runs are reproducible

    process.stdout.write(`  Variation ${String(i + 1).padStart(3, "0")}/${count} `);

    const images = await generateAd(
      product,
      format,
      { hook, cta, mood },
      { ...falOpts, seed, numImages: 1 }
    );

    results.push({
      ...images[0],
      variationIndex: i + 1,
      hook,
      cta,
      mood,
    });

    generated++;
  }

  console.log(`\n  ✓ ${generated} variations complete for ${product.shortName}`);
  return results;
}
