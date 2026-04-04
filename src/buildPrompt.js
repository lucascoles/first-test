import { BRAND } from "./brand.js";

/**
 * Builds a structured image-generation prompt that locks in XYON's
 * product and brand identity so every creative looks on-brand.
 *
 * @param {object} product  - Entry from PRODUCTS in brand.js
 * @param {object} format   - Entry from AD_FORMATS in brand.js
 * @param {object} [opts]   - Optional overrides: { hook, cta, audience, mood }
 * @returns {{ prompt: string, negativePrompt: string }}
 */
export function buildAdPrompt(product, format, opts = {}) {
  const {
    hook = `Stop hair loss before it gets worse`,
    cta = `Start your free consultation at XYON Health`,
    audience = "men aged 25-45 experiencing early hair thinning",
    mood = "clean, clinical, premium",
  } = opts;

  const isPortrait = format.height > format.width;
  const compositionHint = isPortrait
    ? "vertical composition, product in lower two-thirds, headline space at top"
    : "horizontal composition, product on right, copy space on left";

  const prompt = [
    // Subject — the actual product
    `Professional advertising photograph of the ${product.name} product bottle/tube`,
    `placed on a minimalist ${BRAND.colors.primary === "#2a2a2a" ? "dark charcoal" : "white"} surface`,

    // Brand identity
    `XYON Health branding, premium hair loss treatment brand`,
    `color palette: deep charcoal (#2a2a2a) and crisp white`,

    // Product key benefit callout
    `subtle text overlay reading: "${product.keyBenefit}"`,
    `headline: "${hook}"`,
    `call-to-action: "${cta}"`,

    // Technology badge
    `SiloxysSystem™ technology badge visible on packaging`,

    // Format & composition
    compositionHint,
    `${format.width}x${format.height} ${format.label} ad format`,

    // Mood & quality
    `${mood} aesthetic`,
    `studio lighting, sharp focus on product`,
    `${BRAND.tone} visual tone`,
    `photorealistic, 8k, advertising quality`,

    // Audience context
    `designed for ${audience}`,
  ].join(", ");

  const negativePrompt = [
    "generic hair loss imagery",
    "cartoon, illustration, painting",
    "blurry, low quality, watermark",
    "competing brand logos",
    "before/after medical imagery",
    "nudity",
    "off-brand colors (no bright red, no neon)",
    "cluttered layout",
  ].join(", ");

  return { prompt, negativePrompt };
}
