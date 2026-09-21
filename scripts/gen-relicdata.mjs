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
const weapons = parseParam("EquipParamWeapon.param.xml");
const saNames = names("SwordArtsParam.json");
const wepNames = names("EquipParamWeapon.json");
const calcGraph = parseParam("CalcCorrectGraph.param.xml");
const aecParam = parseParam("AttackElementCorrectParam.param.xml");
const heroStatus = parseParam("HeroStatusParam.param.xml");

const val = (p, r, f) => (r[f] !== undefined ? +r[f] : +(p.defaults[f] ?? 0));
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

// known scripted-state conditions worth naming (from pool-effect survey)
const STATE_LABEL = {
  367: "critical hits",
  2110: "enemy afflicted by the matching status",
  2108: "fighting alongside allies",
};

// Conditions that describe a KIND of attack (one hit satisfies at most a few
// of these) rather than a state that can hold during any attack.
const ATTACK_KIND_LABELS = new Set([
  "initial standard attack", "charged attacks", "jump attacks", "guard counters",
  "chain attack finishers", "ranged weapon attacks", "roar & breath attacks",
  "throwing pots", "throwing knives", "perfuming arts", "glintstone & gravity stones",
  "charged spells & skills", "skill attacks", "dash attacks", "rolling attacks",
  "melee attacks", "critical hits", "sorceries", "incantations",
]);

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
  else if (cond === 0 && spVal(r, "stateInfo") !== 0) {
    cond = condId(STATE_LABEL[spVal(r, "stateInfo")] || "situational (effect-specific trigger)");
  }
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

// Attribute bonuses that scale weapon damage: [Str, Dex, Int, Fai, Arc]
const STAT_FIELDS = [
  "addStrengthStatus", "addDexterityStatus", "addMagicStatus",
  "addFaithStatus", "addLuckStatus",
];

// Walk an SpEffect and its trigger chains (depth ≤ 2); return instances
// [[spId, spCategory, categoryPriority, comps, statAdds?]] having any damage
// component or damage-relevant attribute bonus.
function spInstances(rootId) {
  const out = [];
  const seen = new Set();
  const walk = (id, depth, cond) => {
    if (id <= 0 || seen.has(id) || depth > 2) return;
    seen.add(id);
    const r = spById.get(id);
    if (!r) return;
    const comps = rowComps(r, cond);
    const stats = STAT_FIELDS.map((f) => spVal(r, f));
    const hasStats = stats.some((s) => s !== 0);
    if (comps.length || hasStats) {
      const inst = [id, spVal(r, "spCategory"), spVal(r, "categoryPriority"), comps];
      if (hasStats) inst.push(stats);
      out.push(inst);
    }
    for (const f of CHAIN_FIELDS) {
      const next = spVal(r, f);
      if (next > 0) walk(next, depth + 1, COND_TRIGGER);
    }
  };
  walk(rootId, 0, 0);
  return out;
}

// ---- Ash of War / skill effects: which weapon classes can trigger them ----
// Nightreign weapons carry fixed skills (EquipParamWeapon.swordArtsParamId), so
// a skill buff applies only to the weapon classes whose weapons have that
// skill. Effects named "[AoW] <skill>…" are matched to skills by name.
const skillWeps = new Map(); // normalized skill name -> Set(wepType)
for (const w of weapons.rows) {
  const said = +(w.swordArtsParamId ?? weapons.defaults.swordArtsParamId ?? 0);
  const wt = +(w.wepType ?? weapons.defaults.wepType ?? 0);
  if (!said || !wt) continue;
  const key = (saNames.get(said) || "").replace(/^\[[^\]]*\]\s*/, "").trim().toLowerCase();
  if (!key || /no skill/.test(key)) continue;
  if (!skillWeps.has(key)) skillWeps.set(key, new Set());
  skillWeps.get(key).add(wt);
}
const AOW_WEPS = {};
for (const r of NR_EFFECTS) {
  if (!r[5].includes("aow")) continue;
  const m = r[1].match(/^\[AoW\]\s*([^-]+?)(?:\s*-\s*.*)?$/);
  if (!m) continue;
  const set = skillWeps.get(m[1].trim().toLowerCase());
  // matched skill → its weapon classes; known skill name but no NR weapon
  // carries it → empty list (unobtainable, applies to no weapon class)
  AOW_WEPS[r[0]] = set ? [...set].sort((a, b) => a - b) : [];
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
  // exactly one spell flag = a sorcery-only / incantation-only buff; both set
  // means the buff extends to spells on top of weapon attacks (no restriction —
  // e.g. Physical Attack Up carries both flags)
  const mag = spVal(r, "magParamChange") ? 1 : 0;
  const mir = spVal(r, "miracleParamChange") ? 1 : 0;
  if (!subs.length && (mag ^ mir)) kinds.add("c");
  if (kinds.size === 1) SP_KIND[+r.id] = [...kinds][0];
}

// ---- attach effects ----
const attachOut = new Map(); // id -> [name, allowMask, instances, spIds, compat]
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
  // roll-compatibility group: effects sharing a group (≠ -1) can't co-occur on
  // one relic (100 = the Attack Power category, 900 = character-exclusive,
  // 200/300 = starting-armament affinity/skill, 7xxxxxx = same-ability family)
  const compat = a.compatibilityId !== undefined
    ? +a.compatibilityId
    : +(attach.defaults.compatibilityId ?? 100);
  attachOut.set(id, [name, allowMask, instances, spIds, compat]);
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

// ---- weapons & attribute scaling (for stat-relic damage valuation) ----
// AR model: AR_e = base_e × (1 + Σ_stat aecRate/100 × correct_stat/100 ×
// curve(correctType_e, statValue)/100) — the engine's standard formula.
const ELEMENTS = ["Physics", "Magic", "Fire", "Thunder", "Dark"];
const AEC_STATS = ["Strength", "Dexterity", "Magic", "Faith", "Luck"];

const usedCalc = new Set();
const usedAec = new Set();
const WEAPONS = [];
for (const w of weapons.rows) {
  const name = wepNames.get(+w.id);
  const wt = val(weapons, w, "wepType");
  if (!name || !wt || /\[Unknown|\[NPC|NPC\]|\[Cut/i.test(name)) continue;
  const base = [
    val(weapons, w, "attackBasePhysics"), val(weapons, w, "attackBaseMagic"),
    val(weapons, w, "attackBaseFire"), val(weapons, w, "attackBaseThunder"),
    val(weapons, w, "attackBaseDark"),
  ];
  if (!base.some((b) => b > 0)) continue;
  const scal = [
    val(weapons, w, "correctStrength"), val(weapons, w, "correctAgility"),
    val(weapons, w, "correctMagic"), val(weapons, w, "correctFaith"),
    val(weapons, w, "correctLuck"),
  ].map((x) => Math.round(x * 10) / 10);
  const ct = ELEMENTS.map((e) => val(weapons, w, "correctType_" + e));
  const aecId = val(weapons, w, "attackElementCorrectId");
  ct.forEach((c) => usedCalc.add(c));
  usedAec.add(aecId);
  WEAPONS.push([+w.id, name, wt, base, scal, ct, aecId]);
}

const CALC = {};
for (const g of calcGraph.rows) {
  if (!usedCalc.has(+g.id)) continue;
  CALC[+g.id] = [
    [0, 1, 2, 3, 4].map((i) => val(calcGraph, g, "stageMaxVal" + i)),
    [0, 1, 2, 3, 4].map((i) => val(calcGraph, g, "stageMaxGrowVal" + i)),
    [0, 1, 2, 3, 4].map((i) => val(calcGraph, g, "adjPt_maxGrowVal" + i)),
  ];
}

const AEC = {};
for (const a of aecParam.rows) {
  if (!usedAec.has(+a.id)) continue;
  AEC[+a.id] = ELEMENTS.map((e) =>
    AEC_STATS.map((s) => {
      if (!val(aecParam, a, `is${s}Correct_by${e}`)) return 0;
      const ov = val(aecParam, a, `overwrite${s}CorrectRate_by${e}`);
      return ov >= 0 ? ov : 100;
    })
  );
}

// hero attribute anchors [level, Str, Dex, Int, Fai, Arc] — levels between
// anchors interpolate linearly (game rows exist for levels 1, 2, 12, 15)
const HERO_STATS = HEROES.map((_, i) => {
  const anchors = [];
  for (let n = 0; n < 4; n++) {
    const r = heroStatus.rows.find((x) => +x.id === (i + 1) * 10000 + n);
    if (!r) continue;
    anchors.push([
      val(heroStatus, r, "totalLevel"),
      val(heroStatus, r, "statStrength"), val(heroStatus, r, "statDexterity"),
      val(heroStatus, r, "statIntelligence"), val(heroStatus, r, "statFaith"),
      val(heroStatus, r, "statArcane"),
    ]);
  }
  return anchors.sort((a, b) => a[0] - b[0]);
});

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
// 1 = the condition is an attack kind (crit, initial attack…), 0 = a state
export const NR_COND_ATK = ${JSON.stringify(conds.map((c) => (ATTACK_KIND_LABELS.has(c) ? 1 : 0)))};
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
// Ash of War / skill effects: weapon classes whose fixed skill triggers them
// ([] = no Nightreign weapon carries the skill). Absent = not an AoW effect.
export const NR_AOW_WEPS = ${JSON.stringify(AOW_WEPS)};
// weapons: [id, name, wepType, [base atk ×5 elements], [scaling% Str/Dex/Int/Fai/Arc], [CalcCorrectGraph id ×5], attackElementCorrectId]
export const NR_WEAPONS = ${JSON.stringify(WEAPONS)};
// CalcCorrectGraph: id -> [[stageMaxVal×5],[stageMaxGrowVal×5],[adjPt×5]]
export const NR_CALC = ${JSON.stringify(CALC)};
// AttackElementCorrectParam: id -> per element [rate% per stat Str/Dex/Int/Fai/Arc]
export const NR_AEC = ${JSON.stringify(AEC)};
// per hero: attribute anchors [level, Str, Dex, Int, Fai, Arc]; interpolate between
export const NR_HERO_STATS = ${JSON.stringify(HERO_STATS)};
`;
fs.writeFileSync(path.join(import.meta.dirname, "../src/relicdata.js"), out);
console.log(
  `attach ${attachOut.size} | poolN ${POOL_NORMAL.length} | poolD ${POOL_DEEP.length} | relics ${RELICS.length} | vessels ${VESSELS.length} | conds ${conds.length} | ${(out.length / 1024).toFixed(0)}KB`
);
