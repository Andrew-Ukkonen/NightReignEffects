import {
  NR_ATTACH, NR_POOL_NORMAL, NR_POOL_DEEP, NR_RELICS, NR_VESSELS,
  NR_CONDS, NR_HEROES, NR_COLORS,
} from "./relicdata.js";
import { ROWS } from "./model.js";

export { NR_HEROES, NR_COLORS, NR_CONDS };
export const CHANNELS = [
  { key: "phys", bit: 1, label: "Physical" },
  { key: "mag", bit: 2, label: "Magic" },
  { key: "fir", bit: 4, label: "Fire" },
  { key: "lit", bit: 8, label: "Lightning" },
  { key: "hol", bit: 16, label: "Holy" },
];

export const ROW_BY_ID = new Map(ROWS.map((r) => [r.id, r]));

export const VESSELS = NR_VESSELS.map(([id, hero, name, slots, deepSlots]) => ({
  id, hero, name, slots, deepSlots,
}));

// One equippable relic-effect line.
export function makeEffect(attachId) {
  const [name, allowMask, instances, spIds, compat] = NR_ATTACH[attachId];
  return { attachId, name, allowMask, instances, spIds, compat };
}

// Standalone weighted multiplier of one effect under a scenario (no stacking).
export function effectValue(eff, weights, conds) {
  const prod = channelProducts(eff.instances, weights, conds);
  return score(prod, weights);
}

function condEnabled(condId, conds) {
  return condId === 0 || conds.has(condId);
}

function channelProducts(instances, weights, conds) {
  const prod = [1, 1, 1, 1, 1];
  for (const [, , , comps] of instances) {
    for (const [bits, mult, cond] of comps) {
      if (!condEnabled(cond, conds)) continue;
      CHANNELS.forEach((ch, i) => {
        if (bits & ch.bit) prod[i] *= mult;
      });
    }
  }
  return prod;
}

function score(prod, weights) {
  let s = 0, total = 0;
  CHANNELS.forEach((ch, i) => {
    s += weights[i] * prod[i];
    total += weights[i];
  });
  return total ? s / total : 1;
}

// Apply spCategory stacking rules to a multiset of instances.
// Returns { kept: [instance...], dropped: [{inst, reason}] }.
// Rules (SP_EFFECT_SPCATEGORY semantics):
//   cat 0/1, 10 — all instances coexist
//   cat 20     — same effect ID only refreshes: dedupe by spId
//   100–299    — one effect per category (200: per priority) — keep most valuable
//   1000s      — highest categoryPriority wins
//   10000s     — first applied wins: one per category — keep most valuable
export function applyStacking(instances, weights, conds) {
  const kept = [];
  const dropped = [];
  const val = (inst) => score(channelProducts([inst], weights, conds), weights);

  const seen20 = new Set();
  const groups = new Map(); // groupKey -> {best, bestVal, rule}
  for (const inst of instances) {
    const [spId, cat, prio] = inst;
    if (cat === 20) {
      const k = "r" + spId;
      if (seen20.has(k)) { dropped.push({ inst, reason: "duplicate — refreshes only" }); continue; }
      seen20.add(k);
      kept.push(inst);
    } else if (cat >= 100 && cat <= 299) {
      const k = cat === 200 ? "e" + cat + ":" + prio : "e" + cat;
      collect(groups, k, inst, val(inst), "shares exclusive group " + cat);
    } else if (cat >= 1000 && cat <= 1999) {
      collect(groups, "h" + cat, inst, prio * 1e6 + val(inst), "lower priority in category " + cat);
    } else if (cat >= 10000) {
      collect(groups, "f" + cat, inst, val(inst), "only one applies in category " + cat);
    } else {
      kept.push(inst);
    }
  }
  for (const g of groups.values()) {
    kept.push(g.best);
    for (const d of g.rest) dropped.push(d);
  }
  return { kept, dropped };
}
function collect(groups, key, inst, v, reason) {
  let g = groups.get(key);
  if (!g) { groups.set(key, { best: inst, bestVal: v, rest: [], reason }); return; }
  if (v > g.bestVal) {
    g.rest.push({ inst: g.best, reason: g.reason });
    g.best = inst; g.bestVal = v;
  } else {
    g.rest.push({ inst, reason: g.reason });
  }
}

// Evaluate a full set of effects: stacked per-channel products + weighted score.
export function evaluate(effects, weights, conds) {
  const instances = effects.flatMap((e) => e.instances);
  const { kept, dropped } = applyStacking(instances, weights, conds);
  const prod = channelProducts(kept, weights, conds);
  return { prod, score: score(prod, weights), dropped };
}

// Candidate pool effects for a hero (rolled-relic mode).
export function poolCandidates({ hero, deep, weights, conds }) {
  const pool = deep ? NR_POOL_DEEP : NR_POOL_NORMAL;
  const seen = new Set();
  const out = [];
  for (const [attachId, weight] of pool) {
    if (seen.has(attachId)) continue;
    seen.add(attachId);
    const eff = makeEffect(attachId);
    if (!(eff.allowMask & (1 << hero))) continue;
    if (effectValue(eff, weights, conds) <= 1.0001) continue;
    eff.weight = weight;
    out.push(eff);
  }
  return out;
}

// Roll-legality: effects sharing a compatibility group (compat ≠ -1) can never
// roll together on ONE relic (the game's rule — e.g. only one Attack Power
// category effect per relic), and a relic can't roll the same effect twice.
// Across a 3-relic build that caps any group (and any single effect) at 3.
const rollKey = (eff) => (eff.compat !== -1 ? "c" + eff.compat : "a" + eff.attachId);

// Best possible rolled build: 3 relics × 3 effect lines under the roll rules.
// Greedy on marginal gain — exact for independent multiplicative effects, and
// group rules only ever make marginal gains smaller, so re-evaluating each
// pick handles them.
export function optimizeRolled({ hero, deep, weights, conds, slots = 9 }) {
  const cands = poolCandidates({ hero, deep, weights, conds });
  const picks = [];
  const keyCount = new Map(); // rollKey -> picked count (≤ 3: one per relic)
  const copies = new Map(); // attachId -> picked count (≤ 3)
  for (let i = 0; i < slots; i++) {
    let best = null, bestGain = 1.0001;
    const base = evaluate(picks, weights, conds).score;
    for (const c of cands) {
      if ((keyCount.get(rollKey(c)) || 0) >= 3) continue;
      if ((copies.get(c.attachId) || 0) >= 3) continue;
      const gain = evaluate([...picks, c], weights, conds).score / base;
      if (gain > bestGain) { bestGain = gain; best = c; }
    }
    if (!best) break;
    picks.push(best);
    keyCount.set(rollKey(best), (keyCount.get(rollKey(best)) || 0) + 1);
    copies.set(best.attachId, (copies.get(best.attachId) || 0) + 1);
  }
  // Distribute into 3 relics: members of one compatibility group (or copies of
  // one effect) always land on different relics. Groups sized ≤3 with ≤9 picks
  // always admit such an assignment (largest groups first, round-robin).
  const relics = [[], [], []];
  const groups = new Map();
  for (const eff of picks) {
    const k = rollKey(eff);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(eff);
  }
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length);
  for (const members of ordered) {
    const sorted = [...members].sort(
      (a, b) => effectValue(b, weights, conds) - effectValue(a, weights, conds)
    );
    for (const eff of sorted) {
      const target = relics
        .filter((r) => r.length < 3 &&
          !r.some((e) => rollKey(e) === rollKey(eff) || e.attachId === eff.attachId))
        .sort((a, b) => a.length - b.length)[0];
      if (target) target.push(eff);
    }
  }
  return { relics, ...evaluate(picks, weights, conds), effects: picks };
}

// Fixed relics legal for a slot color in a mode.
function fixedForSlot(color, deep, hero) {
  return NR_RELICS.filter(([, , c, isDeep, attachIds]) => {
    if (deep ? false : isDeep) return false; // deep relics only in Deep of Night
    if (color !== 4 && c !== color) return false;
    return attachIds.every((a) => NR_ATTACH[a][1] & (1 << hero));
  });
}

export function relicEffects(attachIds) {
  return attachIds.map(makeEffect);
}

// Best build from fixed (named) relics for a vessel: greedy + swap passes.
export function optimizeFixed({ hero, vessel, deep, weights, conds }) {
  const slotColors = deep ? vessel.deepSlots : vessel.slots;
  const perSlot = slotColors.map((c) => fixedForSlot(c, deep, hero));
  let chosen = [null, null, null];
  const effectsOf = (sel) => sel.filter(Boolean).flatMap((r) => relicEffects(r[4]));
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let s = 0; s < 3; s++) {
      const others = chosen.map((r, i) => (i === s ? null : r));
      const base = effectsOf(others);
      let best = chosen[s];
      let bestScore = evaluate(
        [...base, ...(best ? relicEffects(best[4]) : [])], weights, conds
      ).score;
      for (const r of perSlot[s]) {
        // named relics are unique items — one copy per build
        if (others.some((o) => o && o[0] === r[0])) continue;
        const sc = evaluate([...base, ...relicEffects(r[4])], weights, conds).score;
        if (sc > bestScore + 1e-9) { bestScore = sc; best = r; changed = true; }
      }
      chosen[s] = best;
    }
    if (!changed) break;
  }
  const effects = effectsOf(chosen);
  return { relics: chosen, ...evaluate(effects, weights, conds), effects };
}

// Conditions that actually appear on candidate damage effects, for the UI.
export function relevantConds({ deep }) {
  const pool = deep ? NR_POOL_DEEP : NR_POOL_NORMAL;
  const ids = new Set();
  const scan = (attachId) => {
    const [, , instances] = NR_ATTACH[attachId];
    for (const [, , , comps] of instances) for (const [, , cond] of comps) if (cond) ids.add(cond);
  };
  for (const [attachId] of pool) scan(attachId);
  for (const [, , , isDeep, attachIds] of NR_RELICS) {
    if (deep ? false : isDeep) continue;
    attachIds.forEach(scan);
  }
  return [...ids].sort((a, b) => a - b).map((id) => ({ id, label: NR_CONDS[id] }));
}
