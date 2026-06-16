// fx.mjs — live USD foreign-exchange rates with a daily on-disk cache.
//
// The NAC hub displays every listing's money in USD (converted live) while
// Notion keeps the brochure-local amounts as the source of truth. sync-notion
// calls loadRates() once per run and toUSD(amount, currency) per figure.
//
// Source: open.er-api.com (free, no key, ~daily ECB+ updates, covers VND/MYR/THB
// and every currency the hub uses). Cached in scripts/fx-cache.json keyed by UTC
// date, so re-runs the same day are network-free and byte-stable (no board churn
// from intra-day rate wobble). On fetch failure we fall back to the cached rates
// (any date); if there's no cache at all, toUSD returns null and callers keep the
// local figure rather than show a wrong number.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(__dirname, 'fx-cache.json');
const ENDPOINT = 'https://open.er-api.com/v6/latest/USD';

export async function loadRates() {
  const today = new Date().toISOString().slice(0, 10);
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { /* no cache yet */ }
  if (cache.date === today && cache.rates) return cache;

  try {
    const res = await fetch(ENDPOINT);
    const data = await res.json();
    if (data && data.result === 'success' && data.rates && data.rates.USD === 1) {
      const out = { date: today, fetched: data.time_last_update_utc || today, rates: data.rates };
      fs.writeFileSync(CACHE, JSON.stringify(out, null, 1) + '\n');
      return out;
    }
    throw new Error('bad FX payload: ' + (data && data.result));
  } catch (e) {
    if (cache.rates) { console.warn(`  ⚠ FX fetch failed (${e.message}) — using cached rates from ${cache.date}`); return cache; }
    console.warn(`  ⚠ FX fetch failed and no cache — money will render in local currency: ${e.message}`);
    return { date: today, rates: null };
  }
}

// Convert a local amount to USD. `rates` is USD→X (so divide). USD→USD = identity.
// Returns null when we can't convert (unknown currency / no rates) so callers can
// safely fall back to the local figure instead of emitting a wrong USD value.
export function toUSD(amount, currency, fx) {
  if (amount == null || isNaN(amount)) return null;
  const cur = (currency || 'USD').toUpperCase();
  if (cur === 'USD') return amount;
  const r = fx && fx.rates && fx.rates[cur];
  if (!r) return null;
  return amount / r;
}

// Round a USD figure to a clean step so live-rate wobble doesn't churn the value:
// < $1M → nearest $1,000 · ≥ $1M → nearest $5,000.
export function roundUSD(n) {
  if (n == null) return null;
  const step = n >= 1_000_000 ? 5_000 : 1_000;
  return Math.round(n / step) * step;
}
