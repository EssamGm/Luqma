// Shared Anthropic pricing helper. Prefixed with `_` so Vercel does not
// turn this file into its own route.
//
// Claude Opus 5 pricing, per token: input $5/MTok, output $25/MTok,
// cache write $6.25/MTok (5-min ephemeral), cache read $0.50/MTok.
// Neither analyze.js nor summary.js use cache_control today, so the cache
// terms are 0 in practice — kept here so the math stays correct if that changes.
//
// SAR is pegged to USD at a fixed 3.75 (unchanged since 1986), so a flat
// constant is safe here — no live exchange rate needed.

var PRICE_PER_MTOK_USD = { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 };
var USD_TO_SAR = 3.75;

function sarFromUsage(usage) {
  if (!usage) return 0;
  var usd =
    (
      (usage.input_tokens || 0) * PRICE_PER_MTOK_USD.input +
      (usage.output_tokens || 0) * PRICE_PER_MTOK_USD.output +
      (usage.cache_creation_input_tokens || 0) * PRICE_PER_MTOK_USD.cacheWrite +
      (usage.cache_read_input_tokens || 0) * PRICE_PER_MTOK_USD.cacheRead
    ) / 1e6;
  return usd * USD_TO_SAR;
}

module.exports = { sarFromUsage: sarFromUsage };
