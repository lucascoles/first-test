/**
 * Reddit draft-reply generator.
 *
 * Given a flagged Reddit mention, drafts a HELPFUL, HONEST, DISCLOSED reply for
 * a human to review and post manually. This never posts to Reddit — it only
 * produces text for the dashboard.
 *
 * Hard rules baked into the prompt (non-negotiable for account survival + FTC
 * compliance):
 *   - If the draft mentions XYON, it discloses the commercial connection.
 *   - It answers the person's actual question first; it is not an ad.
 *   - No medical guarantees, no disparaging competitors, defers to a prescriber.
 *   - XYON is only raised when genuinely relevant (sourcing / comparison / brand).
 *
 * Requires env var: ANTHROPIC_API_KEY (create at https://console.anthropic.com).
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-4-8';

// Brand facts the model is allowed to draw on. Edit to match current offering.
const BRAND_BRIEF = `
XYON Health is a US telehealth brand. After an online consult with a licensed
provider, eligible patients can be prescribed compounded TOPICAL finasteride and
TOPICAL dutasteride (applied to the scalp), as an alternative to oral pills for
people concerned about systemic side effects. It is prescription-only and
requires a provider's approval. It is not available without a prescription and
is currently US-only.
`.trim();

const SYSTEM_PROMPT = `
You draft Reddit replies for someone who works with XYON Health and participates
in hair-loss communities (r/tressless, r/Hairloss, etc.). You are writing a DRAFT
that a human will review, edit, and post manually. You never post anything.

Write the way a real, helpful Redditor writes:
- Lowercase-friendly, conversational, concise (usually 2-5 sentences). No marketing
  voice, no exclamation points, no hype, no emoji.
- Answer the person's ACTUAL question first and genuinely. Be useful even to
  someone who never buys anything.

Disclosure + honesty rules (do not break these):
- You may mention XYON ONLY when it directly answers the question (e.g. they're
  asking where to get topical dut/fin, comparing options, or already discussing
  XYON). For pure "my results / venting / general" posts, do NOT pitch XYON —
  just be helpful, or say a reply isn't needed.
- WHENEVER the draft names XYON, include a brief, natural disclosure of the
  connection in the same comment (e.g. "full disclosure, i work with xyon so
  take this with a grain of salt"). Never imply you're an unaffiliated customer.
- It's prescription topical compounded fin/dut via telehealth — say so accurately.
  No guarantees of regrowth, no medical claims, no "cure". Tell them it depends on
  their provider's assessment.
- Never trash competitors (happy head, hims, keeps, etc.). If compared, be fair.
- If the relevant subreddit likely bans promotion, add a one-line caution at the
  end (prefixed "NOTE:") reminding the human to check the sub's self-promo rules
  before posting. The NOTE is guidance to the human, not part of the comment.

Output ONLY the draft comment text (plus an optional trailing "NOTE:" line for the
human). No preamble, no quotes around it.
`.trim();

/**
 * Build the per-mention user prompt.
 */
function buildUserPrompt(m) {
  const kind = m.kind === 'comment' ? 'comment' : 'post';
  const terms = Array.isArray(m.matched_terms)
    ? m.matched_terms.join(', ')
    : (m.matched_terms || '');

  return [
    `Here is a Reddit ${kind} to potentially reply to.`,
    ``,
    `Subreddit: r/${m.subreddit}`,
    `Detected intent: ${m.intent}`,
    `Matched keywords: ${terms}`,
    m.title ? `Thread title: ${m.title}` : null,
    ``,
    `${kind === 'comment' ? 'Comment' : 'Post'} text:`,
    `"""`,
    (m.body || m.title || '').slice(0, 2000),
    `"""`,
    ``,
    `Brand brief you may use:`,
    BRAND_BRIEF,
    ``,
    `Draft the reply now, following all the rules.`,
  ].filter((l) => l !== null).join('\n');
}

/**
 * Generate a draft reply for a mention row.
 * @param {object} mention - a row from reddit_mentions (matched_terms may be array or JSON string)
 * @returns {Promise<{ok: boolean, draft?: string, model?: string, reason?: string}>}
 */
export async function draftReply(mention) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: 'ANTHROPIC_API_KEY not set — add it to .env to enable AI drafts.',
    };
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(mention) }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (!text) return { ok: false, reason: 'Model returned an empty draft.' };

    return { ok: true, draft: text, model: response.model || MODEL };
  } catch (err) {
    return { ok: false, reason: `Draft generation failed: ${err.message}` };
  }
}
