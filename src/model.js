import { NR_EFFECTS, NR_WEPTYPES } from "./data.js";

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

export function verdict(cat) {
  if (cat === 0 || cat === 1) return "free";
  if (cat === 10) return "self";
  if (cat === 20) return "refresh";
  if (cat >= 100 && cat <= 299) return "excl";
  if (cat >= 1000 && cat <= 1999) return "highest";
  if (cat >= 10000) return "first";
  return "excl";
}

export const ROWS = NR_EFFECTS.map((r) => ({
  id: r[0], name: r[1], cat: r[2], prio: r[3], dur: r[4],
  srcs: r[5], weps: r[6], via: r[7], mod: r[8] || "", v: verdict(r[2]),
}));

export const WEP_TYPES = NR_WEPTYPES;
export const WEP_NAME = Object.fromEntries(NR_WEPTYPES);

export function durText(d) {
  if (d === -1) return "∞";
  if (d === 0) return "instant";
  return (d % 1 === 0 ? d : d.toFixed(1)) + "s";
}

// Does row r pass every active filter, optionally ignoring one facet
// ("v" rule chips, "w" weapons, "s" sources)?
export function passes(r, f, skip) {
  if (f.groupCat !== null && r.cat !== f.groupCat) return false;
  if (skip !== "v" && f.verdicts.size && !f.verdicts.has(r.v)) return false;
  if (skip !== "w" && f.weps.size) {
    if (r.weps === "*") {
      if (!f.weps.has("*")) return false;
    } else if (!r.weps.some((w) => f.weps.has(w))) return false;
  }
  if (skip !== "s" && f.srcs.size && !r.srcs.some((s) => f.srcs.has(s))) return false;
  if (f.query &&
      r.name.toLowerCase().indexOf(f.query) === -1 &&
      (r.mod || "").toLowerCase().indexOf(f.query) === -1 &&
      (r.via || "").toLowerCase().indexOf(f.query) === -1 &&
      String(r.id).indexOf(f.query) === -1) return false;
  return true;
}
