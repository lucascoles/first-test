import { fal } from "@fal-ai/client";
import { buildAdPrompt } from "./buildPrompt.js";

/**
 * Generate a single ad creative via fal.ai.
 *
 * @param {object} product   - PRODUCTS entry from brand.js
 * @param {object} format    - AD_FORMATS entry from brand.js
 * @param {object} [opts]    - Prompt overrides: { hook, cta, audience, mood }
 * @param {object} [falOpts] - fal.ai overrides: { model, numImages, seed }
 * @returns {Promise<{ url: string, seed: number, prompt: string }[]>}
 */
export async function generateAd(product, format, opts = {}, falOpts = {}) {
  const {
    model = "fal-ai/flux-pro/v1.1",
    numImages = 1,
    seed = undefined,
  } = falOpts;

  const { prompt, negativePrompt } = buildAdPrompt(product, format, opts);

  const result = await fal.subscribe(model, {
    input: {
      prompt,
      negative_prompt: negativePrompt,
      image_size: {
        width: format.width,
        height: format.height,
      },
      num_images: numImages,
      enable_safety_checker: true,
      ...(seed !== undefined && { seed }),
    },
    logs: true,
    onQueueUpdate(update) {
      if (update.status === "IN_PROGRESS") {
        const latest = update.logs?.at(-1)?.message;
        if (latest) process.stdout.write(`\r  fal: ${latest}      `);
      }
    },
  });

  process.stdout.write("\n");

  return result.data.images.map((img) => ({
    url: img.url,
    seed: result.data.seed,
    prompt,
    product: product.id,
    format: format.label,
  }));
}

/**
 * Batch-generate ads for multiple product × format combinations.
 * Runs sequentially to avoid rate-limit issues; pass concurrency=N to parallelise.
 *
 * @param {Array<{ product, format, opts?, falOpts? }>} jobs
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
