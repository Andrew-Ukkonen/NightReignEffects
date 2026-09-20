// Generates src/relicdata.js from decoded Nightreign params.
//
// Inputs (WitchyBND XML exports of regulation.bin params + Smithbox Paramdex
// community row names):
//   node scripts/gen-relicdata.mjs <paramXmlDir> <namesJsonDir>
//
// paramXmlDir must contain: EquipParamAntique.param.xml, AttachEffectParam.param.xml,
//   AttachEffectTableParam.param.xml, AntiqueStandParam.param.xml, SpEffectParam.param.xml
// namesJsonDir must contain: EquipParamAntique.json, AttachEffectParam.json,
//   AntiqueStandParam.json
import fs from "node:fs";
import path from "node:path";
import { NR_EFFECTS, NR_WEPTYPES } from "../src/data.js";

// weapon-type tags already decoded per SpEffect (wepTypeTrigger, filter params)
const WEP_NAME = Object.fromEntries(NR_WEPTYPES);
const wepsBySp = new Map(NR_EFFECTS.map((r) => [r[0], r[6]]));

const [paramDir, namesDir] = process.argv.slice(2);
if (!paramDir || !namesDir) {
  console.error("usage: node scripts/gen-relicdata.mjs <paramXmlDir> <namesJsonDir>");
  process.exit(1);
}

function parseParam(file) {
  const xml = fs.readFileSync(path.join(paramDir, file), "utf8");
  const defaults = {};
  for (const m of xml.matchAll(/<field name="(\w+)"[^>]*defaultValue="([^"]*)"/g)) {
    defaults[m[1]] = m[2];
  }
  const rows = [...xml.matchAll(/<row ([^/]*)\/>/g)].map((m) => {
    const o = {};
    for (const a of m[1].matchAll(/(\w+)="([^"]*)"/g)) o[a[1]] = a[2];
    return o;
  });
  return { defaults, rows };
}
const names = (file) =>
  new Map(
    JSON.parse(fs.readFileSync(path.join(namesDir, file), "utf8")).Entries.map((e) => [
      e.ID,
      e.Entries[0] || "",
    ])
  );

const relicNames = names("EquipParamAntique.json");
const attachNames = names("AttachEffectParam.json");
const standNames = names("AntiqueStandParam.json");

const antique = parseParam("EquipParamAntique.param.xml");
const attach = parseParam("AttachEffectParam.param.xml");
const table = parseParam("AttachEffectTableParam.param.xml");
const stand = parseParam("AntiqueStandParam.param.xml");
const sp = parseParam("SpEffectParam.param.xml");

const spById = new Map(sp.rows.map((r) => [+r.id, r]));
const spVal = (r, f) => (r[f] !== undefined ? +r[f] : +(sp.defaults[f] ?? 0));

const HEROES = [
  "Wylder", "Guardian", "Ironeye", "Duchess", "Raider",
  "Revenant", "Recluse", "Executor", "Scholar", "Undertaker",
];
const ALLOW_FIELDS = HEROES.map((h) => "allow" + h);

// Attack-kind conditions from SP_EFFECT magicSubCategoryChange values.
const SUBCAT_LABEL = {
  2: "Carian sword sorcery", 3: "glintblade sorcery", 4: "stonedigger sorcery",
  5: "Crystalian sorcery", 9: "thorn sorcery", 11: "gravity sorcery",
  12: "invisibility sorcery", 20: "Godslayer incantations", 21: "Giants' Flame incantations",
  22: "Dragon Cult incantations", 23: "bestial incantations", 24: "Fundamentalist incantations",
  25: "Dragon Communion incantations", 26: "Frenzied Flame incantations",
  100: "charged attacks", 102: "jump attacks", 103: "guard counters",
  104: "chain attack finishers", 105: "ranged weapon attacks", 106: "roar & breath attacks",
  107: "roar & breath attacks", 108: "throwing pots", 109: "perfuming arts",
  110: "charged spells & skills", 111: "skill attacks", 112: "skill attacks",
  113: "ranged weapon attacks", 116: "roar & breath attacks", 118: "ranged weapon attacks",
  119: "initial standard attack", 120: "throwing knives", 121: "glintstone & gravity stones",
  124: "two-handing", 125: "wielding two armaments", 127: "dash attacks",
  128: "rolling attacks", 129: "rolling attacks", 130: "melee attacks",
};

// Condition table: 0 = unconditional. Built as labels are first used.
// condWep[i] = weapon-type id the condition depends on (0 = none).
const conds = ["", "triggered / stacking buff"];
const condWep = [0, 0];
const COND_TRIGGER = 1;
const condId = (label, wep = 0) => {
  let i = conds.indexOf(label);
  if (i === -1) { conds.push(label); condWep.push(wep); i = conds.length - 1; }
  return i;
};

// channel bits: 1 phys, 2 magic, 4 fire, 8 lightning, 16 holy
const CH = { phys: 1, mag: 2, fir: 4, lit: 8, hol: 16 };
const RATE_FIELDS = [
  ["physicsAttackRate", "physicsAttackPowerRate", CH.phys],
  ["magicAttackRate", "magicAttackPowerRate", CH.mag],
  ["fireAttackRate", "fireAttackPowerRate", CH.fir],
  ["thunderAttackRate", "thunderAttackPowerRate", CH.lit],
  ["darkAttackRate", "darkAttackPowerRate", CH.hol],
];
// Physical-attribute-restricted rates fold into phys with a condition label.
const SUBPHYS_FIELDS = [
  ["slashAttackRate", "slashAttackPowerRate", "slash attacks"],
  ["blowAttackRate", "blowAttackPowerRate", "strike attacks"],
  ["thrustAttackRate", "thrustAttackPowerRate", "pierce attacks"],
  ["neutralAttackRate", "neutralAttackPowerRate", "standard attacks"],
];
const CHAIN_FIELDS = ["accumuOverFireId", "cycleOccurrenceSpEffectId", "atkOccurrenceSpEffectId"];

// Extract damage components for one SpEffect row (mult per channel + condition).
function rowComps(r, baseCond) {
  const comps = [];
  let cond = baseCond;
  const labels = [];
  let condW = 0;
  const subs = ["magicSubCategoryChange1", "magicSubCategoryChange2", "magicSubCategoryChange3"]
    .map((f) => spVal(r, f))
    .filter((v) => v !== 0);
  if (subs.length) {
    labels.push([...new Set(subs.map((s) => SUBCAT_LABEL[s] || "attack subtype " + s))].join(" / "));
  }
  // spell-cast-only buffs (school subcats already imply the spell type)
  if (!subs.length) {
    const mag = spVal(r, "magParamChange"), mir = spVal(r, "miracleParamChange");
    if (mag && !mir) labels.push("sorceries");
    else if (mir && !mag) labels.push("incantations");
  }
  const wpc = spVal(r, "wepParamChange");
  if (wpc === 1 || wpc === 2) labels.push(wpc === 1 ? "right armament" : "left armament");
  const weps = wepsBySp.get(+r.id);
  if (Array.isArray(weps) && weps.length) {
    const wnames = weps.map((w) => WEP_NAME[w] || "type " + w).join(" / ");
    const trig = spVal(r, "wepTypeTriggerCount");
    labels.push(trig > 0 ? `${trig}+ ${wnames}s equipped` : `wielding ${wnames}`);
    condW = weps[0];
  }
  if (labels.length) cond = condId(labels.join(" · "), condW);
  // damage fields gated by a scripted state (crits, vs-status, proximity…)
  else if (cond === 0 && spVal(r, "stateInfo") !== 0) cond = condId("situational (effect-specific trigger)");
  // merge channels with identical mult
  const byMult = new Map();
  for (const [rate, powerRate, bit] of RATE_FIELDS) {
    const m = spVal(r, rate) * spVal(r, powerRate);
    if (Math.abs(m - 1) < 1e-6) continue;
    byMult.set(m, (byMult.get(m) || 0) | bit);
  }
  for (const [m, bits] of byMult) comps.push([bits, +m.toFixed(4), cond]);
  for (const [rate, powerRate, label] of SUBPHYS_FIELDS) {
    const m = spVal(r, rate) * spVal(r, powerRate);
    if (Math.abs(m - 1) < 1e-6) continue;
    comps.push([CH.phys, +m.toFixed(4), condId(label)]);
  }
  return comps;
}

// Walk an SpEffect and its trigger chains (depth ≤ 2); return instances
// [[spId, spCategory, categoryPriority, comps]] having any damage component.
function spInstances(rootId) {
  const out = [];
  const seen = new Set();
  const walk = (id, depth, cond) => {
    if (id <= 0 || seen.has(id) || depth > 2) return;
    seen.add(id);
    const r = spById.get(id);
    if (!r) return;
    const comps = rowComps(r, cond);
    if (comps.length) out.push([id, spVal(r, "spCategory"), spVal(r, "categoryPriority"), comps]);
    for (const f of CHAIN_FIELDS) {
      const next = spVal(r, f);
      if (next > 0) walk(next, depth + 1, COND_TRIGGER);
    }
  };
  walk(rootId, 0, 0);
  return out;
}

// ---- attack-kind compatibility per SpEffect (for the weapon filter) ----
// m = melee armaments only, r = ranged (bows/crossbows), c = spell casts,
// n = not tied to the equipped armament's attacks (pots, knives, perfumes, roars).
const SUBCAT_KIND = {};
for (const s of [103, 104, 125, 130]) SUBCAT_KIND[s] = "m";
for (const s of [105, 113, 118]) SUBCAT_KIND[s] = "r";
for (const s of [106, 107, 108, 109, 116, 120, 121]) SUBCAT_KIND[s] = "n";
for (const s of [2, 3, 4, 5, 9, 11, 12, 20, 21, 22, 23, 24, 25, 26]) SUBCAT_KIND[s] = "c";

const SP_KIND = {};
for (const r of sp.rows) {
  const kinds = new Set();
  const subs = ["magicSubCategoryChange1", "magicSubCategoryChange2", "magicSubCategoryChange3"]
    .map((f) => spVal(r, f))
    .filter((v) => v !== 0);
  for (const s of subs) if (SUBCAT_KIND[s]) kinds.add(SUBCAT_KIND[s]);
  if (!subs.length && (spVal(r, "magParamChange") || spVal(r, "miracleParamChange") || spVal(r, "shamanParamChange")))
    kinds.add("c");
  if (kinds.size === 1) SP_KIND[+r.id] = [...kinds][0];
}

// ---- attach effects ----
const attachOut = new Map(); // id -> [name, allowMask, instances, spIds]
function buildAttach(id) {
  if (attachOut.has(id)) return true;
  const a = attach.rows.find((r) => +r.id === id);
  if (!a) return false;
  const name = attachNames.get(id) || "";
  const spIds = ["passiveSpEffectId_1", "passiveSpEffectId_2", "passiveSpEffectId_3"]
    .map((f) => (a[f] !== undefined ? +a[f] : +(attach.defaults[f] ?? -1)))
    .filter((v) => v > 0);
  let allowMask = 0;
  ALLOW_FIELDS.forEach((f, i) => {
    const v = a[f] !== undefined ? +a[f] : +(attach.defaults[f] ?? 1);
    if (v) allowMask |= 1 << i;
  });
  const instances = [];
  for (const sid of spIds) instances.push(...spInstances(sid));
  attachOut.set(id, [name, allowMask, instances, spIds]);
  return true;
}

// ---- pools ----
const tablesById = new Map();
for (const t of table.rows) {
  const id = +t.id;
  if (!tablesById.has(id)) tablesById.set(id, []);
  const w = Math.max(+(t.chanceWeight ?? 0), +(t.chanceWeight_dlc ?? 0));
  tablesById.get(id).push([+t.attachEffectId, w]);
}
function poolOf(tableId) {
  const entries = (tablesById.get(tableId) || []).filter(([a]) => a > 0);
  const out = [];
  for (const [aid, w] of entries) if (buildAttach(aid)) out.push([aid, w]);
  return out;
}
const POOL_NORMAL = poolOf(100);
const POOL_DEEP = poolOf(2000000);

// ---- fixed relics ----
const RELICS = [];
for (const r of antique.rows) {
  if (r.disableParam_NT === "1") continue;
  const id = +r.id;
  const name = relicNames.get(id);
  if (!name || name === "Antique") continue;
  const tableIds = ["attachEffectTableId_1", "attachEffectTableId_2", "attachEffectTableId_3"]
    .map((f) => (r[f] !== undefined ? +r[f] : +(antique.defaults[f] ?? -1)))
    .filter((v) => v > 0);
  if (!tableIds.length) continue;
  // fixed relic = every slot's table resolves to exactly one effect
  const slots = tableIds.map((t) => (tablesById.get(t) || []).filter(([a]) => a > 0));
  if (!slots.every((s) => s.length === 1)) continue;
  const attachIds = slots.map((s) => s[0][0]);
  if (!attachIds.every((a) => buildAttach(a))) continue;
  RELICS.push([id, name, +(r.relicColor ?? 0), r.isDeepRelic === "1" ? 1 : 0, attachIds]);
}

// ---- vessels ----
const VESSELS = [];
for (const v of stand.rows) {
  const id = +v.id;
  const raw = standNames.get(id) || "";
  const m = raw.match(/^\[(\w+)\]\s*(.+)$/);
  if (!m) continue;
  const hero = HEROES.indexOf(m[1]);
  if (hero === -1) continue;
  const val = (f) => (v[f] !== undefined ? +v[f] : +(stand.defaults[f] ?? 0));
  VESSELS.push([
    id, hero, m[2],
    [val("relicSlot1"), val("relicSlot2"), val("relicSlot3")],
    [val("deepRelicSlot1"), val("deepRelicSlot2"), val("deepRelicSlot3")],
  ]);
}

const out = `// GENERATED by scripts/gen-relicdata.mjs — do not edit by hand.
// Source: Nightreign regulation.bin (WitchyBND) + Smithbox Paramdex names.
export const NR_HEROES = ${JSON.stringify(HEROES)};
export const NR_COLORS = ["Red", "Blue", "Yellow", "Green"]; // relicColor 0-3; slot color 4 = white (any)
export const NR_CONDS = ${JSON.stringify(conds)};
// weapon-type id each condition depends on (0 = none) — aligned with NR_CONDS
export const NR_COND_WEP = ${JSON.stringify(condWep)};
// attach effects: id -> [name, heroAllowMask, [[spId, spCategory, catPriority, [[channelBits, mult, condId]…]]…], [spEffectIds]]
export const NR_ATTACH = ${JSON.stringify(Object.fromEntries(attachOut))};
// [attachEffectId, rollWeight]
export const NR_POOL_NORMAL = ${JSON.stringify(POOL_NORMAL)};
export const NR_POOL_DEEP = ${JSON.stringify(POOL_DEEP)};
// fixed relics: [id, name, color, isDeep, [attachEffectIds]]
export const NR_RELICS = ${JSON.stringify(RELICS)};
// vessels: [id, heroIdx, name, [slot colors], [deep slot colors]]
export const NR_VESSELS = ${JSON.stringify(VESSELS)};
// attack-kind restriction per SpEffect id (m melee / r ranged / c spell casts /
// n not-armament-attack). Absent = applies regardless of armament.
export const NR_SP_KIND = ${JSON.stringify(SP_KIND)};
`;
fs.writeFileSync(path.join(import.meta.dirname, "../src/relicdata.js"), out);
console.log(
  `attach ${attachOut.size} | poolN ${POOL_NORMAL.length} | poolD ${POOL_DEEP.length} | relics ${RELICS.length} | vessels ${VESSELS.length} | conds ${conds.length} | ${(out.length / 1024).toFixed(0)}KB`
);
