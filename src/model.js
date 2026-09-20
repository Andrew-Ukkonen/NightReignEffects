import { NR_EFFECTS, NR_WEPTYPES } from "./data.js";
import { NR_SP_KIND, NR_AOW_WEPS } from "./relicdata.js";

export const VERDICTS = {
  self:    { label: "Stacks with itself", cls: "v-self" },
  free:    { label: "No group",           cls: "v-free" },
  refresh: { label: "Refreshes",          cls: "v-refresh" },
  excl:    { label: "Group-exclusive",    cls: "v-excl" },
  highest: { label: "Highest wins",       cls: "v-highest" },
  first:   { label: "First wins",         cls: "v-first" },
};

export const SOURCES = {
  relic:    "Relic",
  weppas:   "Weapon passive",
  aow:      "Ash of War / Skill",
  char:     "Character kit",
  item:     "Item / consumable",
  talisman: "Talisman",
  spell:    "Sorcery / Incantation",
  armor:    "Armor",
  enemy:    "Enemy & boss",
  world:    "World & events",
  other:    "Other / internal",
};

export const TYPES = {
  dmg:    "Damage",
  status: "Status buildup",
  def:    "Defense & resist",
  heal:   "Healing & regen",
  stats:  "Stats & attributes",
  util:   "Utility",
  grant:  "Grants & procs",
  script: "Scripted / other",
};

// Classify what an effect does from its decoded value string.
// An effect can match several types; unclassifiable rows fall into "script".
export function classify(mod, dur) {
  const t = [];
  const m = mod || "";
  if (/% (?:all|phys|magic|fire|ltng|holy) (?:attack|dmg)|[+-][\d.]+ (?:phys|magic|fire|ltng|holy) attack\b|% (?:stance|poise) dmg(?! taken)/.test(m)) t.push("dmg");
  if (/(?:poison|bleed|rot|frost|sleep|madness|death) buildup|(?:frost|bleed|madness|sleep|poison|rot|death) dmg ×/.test(m)) t.push("status");
  if (/negation|dmg taken|taken ×|resist\b|resist ×|immune:|guard stamina|% fall dmg|[+-][\d.]+ poise\b/.test(m)) t.push("def");
  if (/(?:HP|FP|stamina|art gauge)\/[\d.]*s|stamina recovery|% flask healing|(?:^|· )[+][\d.]+ (?:HP|FP)\b/.test(m) ||
      (/[+][\d.]+% max (?:HP|FP)(?!\/)/.test(m) && dur >= 0 && dur <= 1.5)) t.push("heal");
  if (/[+-]\d+ (?:Vig|Mind|End|Str|Dex|Int|Fai|Arc)\b|[+-]\d+ level|% max (?:HP|FP|stamina)(?!\/)/.test(m) &&
      !(dur >= 0 && dur <= 1.5)) t.push("stats");
  if (/runes|discovery|FP cost|cooldown|art (?:gauge|charge)|effect duration|enemy (?:sight|hearing)|bow range|rally/.test(m)) t.push("util");
  if (/grants /.test(m)) t.push("grant");
  if (!t.length) t.push("script");
  return t;
}

export function verdict(cat) {
  if (cat === 0 || cat === 1) return "free";
  if (cat === 10) return "self";
  if (cat === 20) return "refresh";
  if (cat >= 100 && cat <= 299) return "excl";
  if (cat >= 1000 && cat <= 1999) return "highest";
  if (cat >= 10000) return "first";
  return "excl";
}

// Strip bracketed source prefixes that duplicate the Source column
// ("[Relic] X" → "X"), keeping any qualifier ("[Relic - Wylder] X" → "[Wylder] X").
const SRC_PREFIX =
  /^\[(?:Relic|Weapon|AoW|Talisman|Incantation|Sorcery|Item|Key Item|Armor Effect)(?: - ([^\]]+))?\]\s*/;

export function cleanName(name) {
  const m = name.match(SRC_PREFIX);
  if (!m) return name;
  const rest = name.slice(m[0].length);
  return m[1] ? `[${m[1]}] ${rest}` : rest;
}

export const ROWS = NR_EFFECTS.map((r) => ({
  id: r[0], name: cleanName(r[1]), cat: r[2], prio: r[3], dur: r[4],
  srcs: r[5], weps: r[6], via: r[7], mod: r[8] || "", v: verdict(r[2]),
  types: classify(r[8], r[4]),
}));

export const WEP_TYPES = NR_WEPTYPES;
export const WEP_NAME = Object.fromEntries(NR_WEPTYPES);

// Would this effect's bonus apply when attacking with the given weapon class?
// Any-weapon effects can still be restricted to an attack kind: melee-only,
// ranged-only, spell-cast-only, or not tied to the armament at all.
const RANGED_WEPS = new Set([51, 53, 55, 56]);
const CATALYST_WEPS = new Set([57, 61]);
export function kindAllows(kind, wep) {
  if (!kind) return true;
  if (kind === "m") return !RANGED_WEPS.has(wep) && !CATALYST_WEPS.has(wep);
  if (kind === "r") return RANGED_WEPS.has(wep);
  if (kind === "c") return CATALYST_WEPS.has(wep);
  return false; // "n" — pots, perfumes, roars… not the armament's own attacks
}

// Family name for grouping tiered variants of the same effect:
// "Vigor +2" → "Vigor", "Improved X - Potency 2" → "Improved X",
// "[Level 2] Boluses" → "Boluses".
export function familyName(name) {
  return name
    .replace(/^\[Level \d+\]\s*/, "")
    .replace(/\s*[-–]\s*Potency \d+$/i, "")
    .replace(/\s*[-–]\s*Level \d+$/i, "")
    .replace(/\s*\+\d+$/, "")
    .trim();
}

// Collapse rows sharing a family name into one group (order preserved).
export function groupRows(rows) {
  const groups = [];
  const byKey = new Map();
  for (const r of rows) {
    const key = familyName(r.name);
    let g = byKey.get(key);
    if (!g) {
      g = { key, name: key, members: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.members.push(r);
  }
  return groups;
}

export function durText(d) {
  if (d === -1) return "∞";
  if (d === 0) return "instant";
  return (d % 1 === 0 ? d : d.toFixed(1)) + "s";
}

// Does row r pass every active filter, optionally ignoring one facet
// ("v" rule chips, "w" weapons, "s" sources, "t" effect types)?
export function passes(r, f, skip) {
  if (f.groupCat !== null && r.cat !== f.groupCat) return false;
  if (skip !== "v" && f.verdicts.size && !f.verdicts.has(r.v)) return false;
  if (skip !== "t" && f.types?.size && !r.types.some((t) => f.types.has(t))) return false;
  if (skip !== "w" && f.weps.size) {
    const aow = NR_AOW_WEPS[r.id]; // skill buffs: only the classes with that skill
    let ok = false;
    for (const w of f.weps) {
      if (aow) {
        if (aow.includes(w)) { ok = true; break; }
      } else if (r.weps === "*") {
        // untagged player buff: include if it can apply to this weapon class
        if (kindAllows(NR_SP_KIND[r.id], w)) { ok = true; break; }
      } else if (r.weps.includes(w)) { ok = true; break; }
    }
    if (!ok) return false;
  }
  if (skip !== "s" && f.srcs.size && !r.srcs.some((s) => f.srcs.has(s))) return false;
  if (f.query &&
      r.name.toLowerCase().indexOf(f.query) === -1 &&
      (r.mod || "").toLowerCase().indexOf(f.query) === -1 &&
      (r.via || "").toLowerCase().indexOf(f.query) === -1 &&
      String(r.id).indexOf(f.query) === -1) return false;
  return true;
}
