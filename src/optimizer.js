import {
  NR_ATTACH, NR_POOL_NORMAL, NR_POOL_DEEP, NR_RELICS, NR_VESSELS,
  NR_CONDS, NR_HEROES, NR_COLORS,
  NR_WEAPONS, NR_CALC, NR_AEC, NR_HERO_STATS, NR_SP_KIND,
} from "./relicdata.js";
import { ROWS, kindAllows } from "./model.js";

// The kinds of hits a build can be measured against. `conds` are the condition
// labels that hit satisfies; `kind` gates which restricted effects apply to it
// (m melee armament, r ranged armament, c spell cast, n item attack,
// * armament skill — follows the weapon).
export const ATTACK_TYPES = [
  { label: "Standard attack", conds: ["melee attacks"], kind: "m" },
  { label: "Initial standard attack", conds: ["initial standard attack", "melee attacks"], kind: "m" },
  { label: "Charged attack", conds: ["charged attacks", "melee attacks"], kind: "m" },
  { label: "Jump attack", conds: ["jump attacks", "melee attacks"], kind: "m" },
  { label: "Dash attack", conds: ["dash attacks", "melee attacks"], kind: "m" },
  { label: "Rolling attack", conds: ["rolling attacks", "melee attacks"], kind: "m" },
  { label: "Guard counter", conds: ["guard counters", "melee attacks"], kind: "m" },
  { label: "Chain attack finisher", conds: ["chain attack finishers", "melee attacks"], kind: "m" },
  { label: "Critical hit", conds: ["critical hits", "melee attacks"], kind: "m" },
  { label: "Ranged weapon attack", conds: ["ranged weapon attacks"], kind: "r" },
  { label: "Skill attack", conds: ["skill attacks"], kind: "*" },
  { label: "Charged spell / skill", conds: ["charged spells & skills", "skill attacks"], kind: "*" },
  { label: "Sorcery cast", conds: ["sorceries"], kind: "c" },
  { label: "Incantation cast", conds: ["incantations"], kind: "c" },
  { label: "Roar & breath attack", conds: ["roar & breath attacks"], kind: "*" },
  { label: "Throwing pot", conds: ["throwing pots"], kind: "n" },
  { label: "Throwing knife", conds: ["throwing knives"], kind: "n" },
  { label: "Perfume art", conds: ["perfuming arts"], kind: "n" },
  { label: "Glintstone / gravity stone", conds: ["glintstone & gravity stones"], kind: "n" },
].map((t) => ({
  ...t,
  condIds: t.conds.map((c) => NR_CONDS.indexOf(c)).filter((i) => i > 0),
}));

export { NR_HEROES, NR_COLORS, NR_CONDS, NR_WEAPONS };
export const CHANNELS = [
  { key: "phys", bit: 1, label: "Physical" },
  { key: "mag", bit: 2, label: "Magic" },
  { key: "fir", bit: 4, label: "Fire" },
  { key: "lit", bit: 8, label: "Lightning" },
  { key: "hol", bit: 16, label: "Holy" },
];
export const STAT_NAMES = ["Str", "Dex", "Int", "Fai", "Arc"];

export const ROW_BY_ID = new Map(ROWS.map((r) => [r.id, r]));

export const VESSELS = NR_VESSELS.map(([id, hero, name, slots, deepSlots]) => ({
  id, hero, name, slots, deepSlots,
}));

// ---- hero attributes & weapon attack rating ----

// [Str, Dex, Int, Fai, Arc] at a level, interpolating between the game's
// anchor rows (levels 1, 2, 12, 15).
export function heroBaseStats(hero, level) {
  const anchors = NR_HERO_STATS[hero] || [];
  if (!anchors.length) return [10, 10, 10, 10, 10];
  if (level <= anchors[0][0]) return anchors[0].slice(1);
  for (let i = 0; i < anchors.length - 1; i++) {
    const [l0, ...s0] = anchors[i];
    const [l1, ...s1] = anchors[i + 1];
    if (level <= l1) {
      const t = (level - l0) / (l1 - l0);
      return s0.map((v, k) => Math.round(v + (s1[k] - v) * t));
    }
  }
  return anchors[anchors.length - 1].slice(1);
}

// CalcCorrectGraph: piecewise growth curve, the engine's standard shape.
function calcCurve(graphId, x) {
  const g = NR_CALC[graphId];
  if (!g) return 0;
  const [mv, gv, ad] = g;
  if (x <= mv[0]) return gv[0];
  for (let i = 0; i < 4; i++) {
    if (x <= mv[i + 1] || i === 3) {
      const span = mv[i + 1] - mv[i] || 1;
      const r = Math.min(Math.max((x - mv[i]) / span, 0), 1);
      const a = ad[i];
      const growth = a > 0 ? Math.pow(r, a) : a < 0 ? 1 - Math.pow(1 - r, -a) : r;
      return gv[i] + (gv[i + 1] - gv[i]) * growth;
    }
  }
  return gv[4];
}

// Attack rating per element: base × (1 + Σ aecRate × scaling × curve(stat)).
export function weaponAR(weapon, stats) {
  const [, , , base, scal, ct, aecId] = weapon;
  const aec = NR_AEC[aecId];
  return base.map((b, e) => {
    if (!b) return 0;
    let sum = 0;
    for (let s = 0; s < 5; s++) {
      const rate = aec ? aec[e][s] : 0;
      if (!rate || !scal[s]) continue;
      sum += (rate / 100) * (scal[s] / 100) * (calcCurve(ct[e], stats[s]) / 100);
    }
    return b * (1 + sum);
  });
}

// Element weights implied by a weapon: its AR split at the base stats.
export function weaponWeights(weapon, stats) {
  const ar = weaponAR(weapon, stats);
  const total = ar.reduce((a, b) => a + b, 0) || 1;
  return ar.map((a) => a / total);
}

// Per-element damage ratio from attribute bonuses: AR(base+delta)/AR(base).
// Item attacks (pots, knives, perfumes) don't swing the weapon, so they don't
// gain from weapon scaling.
function statRatios(sc, delta) {
  if (!sc.weapon || sc.attackKind === "n" || !delta.some((d) => d)) return null;
  const base = weaponAR(sc.weapon, sc.stats);
  const boosted = weaponAR(sc.weapon, sc.stats.map((v, i) => v + delta[i]));
  return base.map((b, e) => (b > 0 ? boosted[e] / b : 1));
}

// ---- effects & scoring ----
// A scenario sc = { weights, conds, weapon (NR_WEAPONS tuple | null), stats }.

export function makeEffect(attachId) {
  const [name, allowMask, instances, spIds, compat] = NR_ATTACH[attachId];
  return { attachId, name, allowMask, instances, spIds, compat };
}

function condEnabled(condId, conds) {
  return condId === 0 || conds.has(condId);
}

// Does a kind-restricted effect instance apply to the hit being scored?
function instAllowed(spId, sc) {
  const k = NR_SP_KIND[spId];
  if (!k) return true;
  const rk = sc.attackKind;
  if (!rk || rk === "*") return sc.weapon ? kindAllows(k, sc.weapon[2]) : k !== "n";
  return k === rk;
}

function channelProducts(instances, sc) {
  const prod = [1, 1, 1, 1, 1];
  for (const [spId, , , comps] of instances) {
    // buffs that can't apply to this hit score nothing (melee-only on a bow,
    // pot buffs on a weapon swing, spell-school buffs on a melee hit, …)
    if (!instAllowed(spId, sc)) continue;
    for (const [bits, mult, cond] of comps) {
      if (!condEnabled(cond, sc.conds)) continue;
      CHANNELS.forEach((ch, i) => {
        if (bits & ch.bit) prod[i] *= mult;
      });
    }
  }
  return prod;
}

function statDeltaOf(instances) {
  const delta = [0, 0, 0, 0, 0];
  for (const inst of instances) {
    const stats = inst[4];
    if (stats) for (let i = 0; i < 5; i++) delta[i] += stats[i];
  }
  return delta;
}

function score(prod, weights) {
  let s = 0, total = 0;
  CHANNELS.forEach((_, i) => {
    s += weights[i] * prod[i];
    total += weights[i];
  });
  return total ? s / total : 1;
}

function scoreInstances(instances, sc) {
  const prod = channelProducts(instances, sc);
  const ratios = statRatios(sc, statDeltaOf(instances));
  if (ratios) ratios.forEach((r, e) => { prod[e] *= r; });
  return { prod, score: score(prod, sc.weights) };
}

// Standalone weighted multiplier of one effect under a scenario (no stacking).
export function effectValue(eff, sc) {
  return scoreInstances(eff.instances, sc).score;
}

// Apply spCategory stacking rules to a multiset of instances.
// Returns { kept: [instance...], dropped: [{inst, reason}] }.
// Rules (SP_EFFECT_SPCATEGORY semantics):
//   cat 0/1, 10 — all instances coexist
//   cat 20     — same effect ID only refreshes: dedupe by spId
//   100–299    — one effect per category (200: per priority) — keep most valuable
//   1000s      — highest categoryPriority wins
//   10000s     — first applied wins: one per category — keep most valuable
export function applyStacking(instances, sc) {
  const kept = [];
  const dropped = [];
  const val = (inst) => scoreInstances([inst], sc).score;

  const seen20 = new Set();
  const groups = new Map();
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

// Evaluate a full set of effects: stacked per-channel products (including
// attribute-scaling gains through the equipped weapon) + weighted score.
export function evaluate(effects, sc) {
  const instances = effects.flatMap((e) => e.instances);
  const { kept, dropped } = applyStacking(instances, sc);
  const { prod, score: s } = scoreInstances(kept, sc);
  return { prod, score: s, dropped, statDelta: statDeltaOf(kept) };
}

// Candidate pool effects for a hero (rolled-relic mode).
export function poolCandidates({ hero, deep, sc }) {
  const pool = deep ? NR_POOL_DEEP : NR_POOL_NORMAL;
  const seen = new Set();
  const out = [];
  for (const [attachId, weight] of pool) {
    if (seen.has(attachId)) continue;
    seen.add(attachId);
    const eff = makeEffect(attachId);
    if (!(eff.allowMask & (1 << hero))) continue;
    if (effectValue(eff, sc) <= 1.0001) continue;
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
// Greedy on marginal gain — near-exact for independent multiplicative effects;
// group rules and stat diminishing returns only shrink marginal gains, so
// re-evaluating each pick handles them.
export function optimizeRolled({ hero, deep, sc, slots = 9 }) {
  const cands = poolCandidates({ hero, deep, sc });
  const picks = [];
  const keyCount = new Map();
  const copies = new Map();
  for (let i = 0; i < slots; i++) {
    let best = null, bestGain = 1.0001;
    const base = evaluate(picks, sc).score;
    for (const c of cands) {
      if ((keyCount.get(rollKey(c)) || 0) >= 3) continue;
      if ((copies.get(c.attachId) || 0) >= 3) continue;
      const gain = evaluate([...picks, c], sc).score / base;
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
    const sorted = [...members].sort((a, b) => effectValue(b, sc) - effectValue(a, sc));
    for (const eff of sorted) {
      const target = relics
        .filter((r) => r.length < 3 &&
          !r.some((e) => rollKey(e) === rollKey(eff) || e.attachId === eff.attachId))
        .sort((a, b) => a.length - b.length)[0];
      if (target) target.push(eff);
    }
  }
  return { relics, ...evaluate(picks, sc), effects: picks };
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
export function optimizeFixed({ hero, vessel, deep, sc }) {
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
        [...base, ...(best ? relicEffects(best[4]) : [])], sc
      ).score;
      for (const r of perSlot[s]) {
        // named relics are unique items — one copy per build
        if (others.some((o) => o && o[0] === r[0])) continue;
        const s2 = evaluate([...base, ...relicEffects(r[4])], sc).score;
        if (s2 > bestScore + 1e-9) { bestScore = s2; best = r; changed = true; }
      }
      chosen[s] = best;
    }
    if (!changed) break;
  }
  const effects = effectsOf(chosen);
  return { relics: chosen, ...evaluate(effects, sc), effects };
}

// Score a build against every applicable kind of hit. Each row activates only
// its own attack-kind conditions on top of the checked state conditions
// (sc.stateConds), so "Critical hit" counts crit buffs, "Initial standard
// attack" counts initial-attack buffs, and neither leaks into the other.
export function damageByAttackType(effects, sc) {
  const buildConds = new Set();
  for (const e of effects)
    for (const [, , , comps] of e.instances)
      for (const [, , c] of comps) if (c) buildConds.add(c);
  const rows = [];
  for (const t of ATTACK_TYPES) {
    const visible =
      t.kind === "n"
        ? t.condIds.some((c) => buildConds.has(c))
        : t.kind === "*" || !sc.weapon || kindAllows(t.kind, sc.weapon[2]);
    if (!visible) continue;
    const conds = new Set([...sc.stateConds, ...t.condIds]);
    const r = evaluate(effects, { ...sc, conds, attackKind: t.kind });
    rows.push({ label: t.label, kind: t.kind, condIds: t.condIds, score: r.score });
  }
  return rows;
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
