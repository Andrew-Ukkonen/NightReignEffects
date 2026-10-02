import {
  NR_ATTACH, NR_POOL_NORMAL, NR_POOL_DEEP, NR_POOL_CURSE, NR_RELICS, NR_VESSELS,
  NR_CONDS, NR_HEROES, NR_COLORS,
  NR_WEAPONS, NR_CALC, NR_AEC, NR_HERO_STATS, NR_SP_KIND,
} from "./relicdata.js";
import { ROWS, kindAllows, cleanName } from "./model.js";

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

// ---- status ailments on the enemy ----
// Relic buffs keyed to an ailment ("…facing poison-afflicted enemy", "Sleep in
// Vicinity…") carry a generic scripted-state condition in the params; the
// ailment is only in the effect name. Those conditions are rewritten to a
// status condition: STATUS_COND + bitmask of ailments, any of which enables it.
// `debuff` = what the ailment itself does to the target's damage taken
// (frostbite: every damage cut rate ×1.15 for 30s).
export const STATUSES = [
  { key: "poison", label: "Poison", re: /poison/i, inflict: /\bpoison/i },
  { key: "rot", label: "Scarlet rot", re: /scarlet rot|\brot\b/i, inflict: /\brot\b|scarlet/i },
  { key: "frost", label: "Frostbite", re: /frost/i, inflict: /frost|\bcold\b/i, debuff: 1.15 },
  { key: "sleep", label: "Sleep", re: /sleep/i, inflict: /sleep/i },
  { key: "madness", label: "Madness", re: /madness/i, inflict: /madness|frenzied/i },
].map((s, i) => ({ ...s, bit: 1 << i }));
const STATUS_COND = 1000;
const STATUS_SOURCE = /afflicted|in vicinity/i;
const SCRIPTED_CONDS = new Set([1, NR_CONDS.indexOf("enemy afflicted by the matching status")]);

// Ailment debuffs as pseudo-instances (spId < 0: no kind restriction, cat 0).
const STATUS_DEBUFFS = STATUSES.filter((s) => s.debuff).map((s) => ({
  bit: s.bit,
  inst: [-1 - s.bit, 0, 0, [[31, s.debuff, STATUS_COND + s.bit]]],
}));

export function condLabel(c) {
  if (c >= STATUS_COND) {
    const names = STATUSES.filter((s) => (c - STATUS_COND) & s.bit).map((s) => s.label.toLowerCase());
    return "enemy afflicted by " + names.join(" or ");
  }
  return NR_CONDS[c];
}

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

// Ailments a weapon inflicts, from its affinity name ("Cold Dagger", "Poison …").
export function weaponStatusMask(weapon) {
  if (!weapon) return 0;
  let m = 0;
  for (const s of STATUSES) if (s.inflict.test(weapon[1])) m |= s.bit;
  return m;
}

// Per-element damage ratio from attribute bonuses: AR(base+delta)/AR(base).
// Item attacks (pots, knives, perfumes) don't swing the weapon, so they don't
// gain from weapon scaling.
function statRatios(sc, delta) {
  if (!sc.weapon || sc.attackKind === "n" || !delta.some((d) => d)) return null;
  const base = weaponAR(sc.weapon, sc.stats);
  const boosted = weaponAR(sc.weapon, sc.stats.map((v, i) => Math.max(v + delta[i], 1)));
  return base.map((b, e) => (b > 0 ? boosted[e] / b : 1));
}

// ---- effects & scoring ----
// A scenario sc = { weights, conds, statusMask, weapon (NR_WEAPONS tuple | null),
// stats, attackKind }.

const effectCache = new Map();
export function makeEffect(attachId) {
  let eff = effectCache.get(attachId);
  if (eff) return eff;
  const [name, allowMask, rawInstances, spIds, compat] = NR_ATTACH[attachId];
  let instances = rawInstances;
  let statusMask = 0;
  if (STATUS_SOURCE.test(name)) {
    for (const s of STATUSES) if (s.re.test(name)) statusMask |= s.bit;
    if (statusMask) {
      instances = rawInstances.map(([spId, cat, prio, comps, ...rest]) => [
        spId, cat, prio,
        comps.map(([bits, mult, cond]) =>
          [bits, mult, SCRIPTED_CONDS.has(cond) ? STATUS_COND + statusMask : cond]),
        ...rest,
      ]);
    }
  }
  eff = { attachId, name, allowMask, instances, spIds, compat, statusMask };
  effectCache.set(attachId, eff);
  return eff;
}

function condEnabled(cond, sc) {
  if (cond === 0) return true;
  if (cond >= STATUS_COND) return ((cond - STATUS_COND) & (sc.statusMask || 0)) !== 0;
  return sc.conds.has(cond);
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
      if (!condEnabled(cond, sc)) continue;
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
//   100–199    — one effect per category — keep most valuable
//   200–299    — one effect per category and priority — keep most valuable
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
      const k = cat >= 200 ? "e" + cat + ":" + prio : "e" + cat;
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
// attribute-scaling gains through the equipped weapon and the enemy's ailment
// debuffs) + weighted score.
export function evaluate(effects, sc) {
  const instances = effects.flatMap((e) => e.instances);
  for (const d of STATUS_DEBUFFS) if (sc.statusMask & d.bit) instances.push(d.inst);
  const { kept, dropped } = applyStacking(instances, sc);
  const { prod, score: s } = scoreInstances(kept, sc);
  return { prod, score: s, dropped, statDelta: statDeltaOf(kept) };
}

// Status simulation: each inflicted ailment is up for `uptime` (0–1) of the
// fight, independently. Returns the full-uptime evaluation plus the expected
// multiplier averaged over every on/off combination of the ailments.
// statuses = [{ bit, uptime }].
export function simulate(effects, sc, statuses = []) {
  const all = statuses.reduce((m, s) => m | s.bit, 0);
  const full = evaluate(effects, { ...sc, statusMask: all });
  if (statuses.every((s) => s.uptime >= 1)) return { ...full, expected: full.score };
  let expected = 0;
  for (let combo = 0; combo < 1 << statuses.length; combo++) {
    let p = 1, mask = 0;
    statuses.forEach((s, i) => {
      if (combo & (1 << i)) { p *= s.uptime; mask |= s.bit; }
      else p *= 1 - s.uptime;
    });
    if (p > 0) expected += p * evaluate(effects, { ...sc, statusMask: mask }).score;
  }
  return { ...full, expected };
}

// Score a build against every applicable kind of hit. Each row activates only
// its own attack-kind conditions on top of the checked state conditions
// (sc.stateConds), so "Critical hit" counts crit buffs, "Initial standard
// attack" counts initial-attack buffs, and neither leaks into the other.
export function damageByAttackType(effects, sc, statuses = []) {
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
    const r = simulate(effects, { ...sc, conds, attackKind: t.kind }, statuses);
    rows.push({ label: t.label, kind: t.kind, condIds: t.condIds, score: r.expected });
  }
  return rows;
}

// ---- relic pools & roll legality ----

const poolMap = (pool) => new Map(pool.map(([a, w, curse]) => [a, { weight: w, curse: !!curse }]));
export const POOL_NORMAL = poolMap(NR_POOL_NORMAL);
export const POOL_DEEP = poolMap(NR_POOL_DEEP);
export const POOL_CURSE = poolMap(NR_POOL_CURSE);

// Roll-legality: effects sharing a compatibility group (compat ≠ -1) can never
// roll together on ONE relic (the game's rule — e.g. only one Attack Power
// category effect per relic), and a relic can't roll the same effect twice.
const rollKey = (eff) => (eff.compat !== -1 ? "c" + eff.compat : "a" + eff.attachId);

const COMPAT_LABEL = {
  100: "Attack Power category",
  200: "starting-armament affinity",
  300: "starting-armament skill",
  800: "sorcery-school improvement",
  900: "character-exclusive",
};
export function compatLabel(eff) {
  if (eff.compat === -1) return "same effect";
  return COMPAT_LABEL[eff.compat] || "same effect family";
}

// An empty loadout slot. Normal slots may hold a named (fixed-effect) relic.
export const emptySlot = () => ({
  named: false,
  relicId: 0,
  lines: [0, 1, 2].map(() => ({ a: 0, c: 0 })),
});

export const RELIC_BY_ID = new Map(NR_RELICS.map((r) => [r[0], r]));

// Effects a slot contributes (named relic's fixed effects, or rolled lines and
// their curses).
export function slotEffects(slot) {
  if (slot.named) {
    const r = RELIC_BY_ID.get(slot.relicId);
    return r ? r[4].map(makeEffect) : [];
  }
  const out = [];
  for (const l of slot.lines) {
    if (l.a) out.push(makeEffect(l.a));
    if (l.a && l.c && POOL_DEEP.get(l.a)?.curse) out.push(makeEffect(l.c));
  }
  return out;
}

// Named relics legal for a slot color (white slots take any color).
export function namedForSlot(color, hero) {
  return NR_RELICS.filter(([, , c, isDeep, attachIds]) => {
    if (isDeep) return false;
    if (color !== 4 && c !== color) return false;
    return attachIds.every((a) => NR_ATTACH[a][1] & (1 << hero));
  });
}

// Why can't this effect go on this relic line? (null = it can.)
function lineConflict(slot, lineIdx, eff, hero, deepSlot) {
  const pool = deepSlot ? POOL_DEEP : POOL_NORMAL;
  if (!pool.has(eff.attachId)) return deepSlot ? "can't roll on a Deep relic" : "Deep relics only";
  if (!(eff.allowMask & (1 << hero))) return "not available to " + NR_HEROES[hero];
  for (let j = 0; j < slot.lines.length; j++) {
    const a = slot.lines[j].a;
    if (j === lineIdx || !a) continue;
    const other = makeEffect(a);
    if (rollKey(other) === rollKey(eff))
      return `can't share a relic with ${cleanName(other.name)} (${compatLabel(eff)})`;
  }
  return null;
}

// Picker options for one rolled line: every effect in the slot's roll pool
// that this hero can use, with its standalone value and — when it can't go on
// this relic beside the other lines — the reason.
export function lineOptions(slot, lineIdx, { hero, deepSlot, sc }) {
  const pool = deepSlot ? POOL_DEEP : POOL_NORMAL;
  const out = [];
  for (const [a, info] of pool) {
    const eff = makeEffect(a);
    if (!(eff.allowMask & (1 << hero))) continue;
    out.push({
      id: a,
      name: cleanName(eff.name),
      value: effectValue(eff, sc),
      curse: info.curse,
      conflict: lineConflict(slot, lineIdx, eff, hero, deepSlot),
    });
  }
  return out;
}

export function curseOptions(slot, lineIdx, { sc }) {
  const taken = new Set(slot.lines.filter((l, j) => j !== lineIdx && l.a && l.c).map((l) => l.c));
  return [...POOL_CURSE.keys()].map((c) => {
    const eff = makeEffect(c);
    return {
      id: c,
      name: cleanName(eff.name),
      value: effectValue(eff, sc),
      conflict: taken.has(c) ? "already on this relic" : null,
    };
  });
}

// Validate one slot. Returns { relic: [msg], lines: [[msg]…], curses: [[msg]…] }.
export function validateSlot(slot, { hero, color, deepSlot, namedElsewhere }) {
  const v = { relic: [], lines: [[], [], []], curses: [[], [], []] };
  if (slot.named) {
    const r = RELIC_BY_ID.get(slot.relicId);
    if (!r) return v;
    if (color !== 4 && r[2] !== color)
      v.relic.push(`${NR_COLORS[r[2]]} relic doesn't fit a ${NR_COLORS[color]} slot`);
    if (!r[4].every((a) => NR_ATTACH[a][1] & (1 << hero)))
      v.relic.push("has effects " + NR_HEROES[hero] + " can't use");
    if (namedElsewhere.has(r[0])) v.relic.push("this relic is already equipped in another slot");
    return v;
  }
  slot.lines.forEach((l, i) => {
    if (!l.a) return;
    const eff = makeEffect(l.a);
    const why = lineConflict({ lines: slot.lines.slice(0, i) }, -1, eff, hero, deepSlot);
    if (why) v.lines[i].push(why);
    if (deepSlot && POOL_DEEP.get(l.a)?.curse) {
      if (!l.c) v.curses[i].push("Deep-exclusive effects always roll with a curse — pick one");
      else if (slot.lines.slice(0, i).some((o) => o.a && o.c === l.c && POOL_DEEP.get(o.a)?.curse))
        v.curses[i].push("this curse is already on the relic");
    }
  });
  return v;
}

// Fill every empty rolled line with the best damage roll available, keeping
// every line already chosen. Greedy on marginal gain: each step tries every
// legal (slot, effect) placement against the whole loadout, so stacking rules,
// roll-legality and stat diminishing returns are all respected. Deep-exclusive
// effects come with the least harmful curse.
export function fillBest(slots, { hero, deepSlots, sc, statuses }) {
  const next = slots.map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l })) }));
  const active = next.map((s, i) => i < 3 || deepSlots);
  const cands = (deepSlot) =>
    [...(deepSlot ? POOL_DEEP : POOL_NORMAL).keys()]
      .map(makeEffect)
      .filter((e) => e.allowMask & (1 << hero))
      .filter((e) => simulate([e], sc, statuses).expected > 1.0001);
  const candN = cands(false), candD = deepSlots ? cands(true) : [];
  const curses = [...POOL_CURSE.keys()].map(makeEffect)
    .sort((a, b) => simulate([b], sc, statuses).expected - simulate([a], sc, statuses).expected);
  const all = () => next.filter((_, i) => active[i]).flatMap(slotEffects);
  const value = (effs) => simulate(effs, sc, statuses).expected;

  for (;;) {
    const current = all();
    const base = value(current);
    let best = null, bestGain = 1.0001;
    next.forEach((slot, si) => {
      if (!active[si] || slot.named) return;
      const li = slot.lines.findIndex((l) => !l.a);
      if (li === -1) return;
      const deepSlot = si >= 3;
      for (const eff of deepSlot ? candD : candN) {
        if (lineConflict(slot, li, eff, hero, deepSlot)) continue;
        const add = [eff];
        let curse = 0;
        if (deepSlot && POOL_DEEP.get(eff.attachId).curse) {
          const used = new Set(slot.lines.map((l) => l.c));
          const c = curses.find((x) => !used.has(x.attachId));
          if (!c) continue;
          curse = c.attachId;
          add.push(c);
        }
        const gain = value([...current, ...add]) / base;
        if (gain > bestGain) { bestGain = gain; best = { si, li, a: eff.attachId, c: curse }; }
      }
    });
    if (!best) break;
    next[best.si].lines[best.li] = { a: best.a, c: best.c };
  }
  return next;
}

// Conditions that actually appear on candidate damage effects, for the UI.
// Ailment conditions are left out — the status panel drives those.
export function relevantConds({ deep }) {
  const ids = new Set();
  const scan = (attachId) => {
    for (const [, , , comps] of makeEffect(attachId).instances)
      for (const [, , cond] of comps) if (cond && cond < STATUS_COND) ids.add(cond);
  };
  for (const a of POOL_NORMAL.keys()) scan(a);
  if (deep) for (const a of [...POOL_DEEP.keys(), ...POOL_CURSE.keys()]) scan(a);
  for (const [, , , isDeep, attachIds] of NR_RELICS) if (!isDeep) attachIds.forEach(scan);
  return [...ids].sort((a, b) => a - b).map((id) => ({ id, label: NR_CONDS[id] }));
}
