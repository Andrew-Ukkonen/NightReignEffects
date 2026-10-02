// Generates src/stackdata.js: the stacking rule that actually governs effects
// whose own SpEffectParam row does nothing by itself.
//
// Many named effects are only a trigger or a flag — no stat fields, just a
// chain to another row (replaceSpEffectId, cycleOccurrenceSpEffectId, …) or a
// marker that event scripts look for. Their own spCategory says nothing about
// how the buff stacks. Example: "[Relic] Attack power permanently increased for
// each evergaol prisoner defeated" is a cat-10 flag (7060001) plus a cat-10
// trigger (7060000) that replaces itself with 7069001 — and 7069001…7069010 is a
// ladder of tiers (×1.05, ×1.05², …) in exclusive cat 204: one tier is ever
// active, each evergaol moves to the next, and extra copies of the relic add
// nothing (the script fires once per kill).
//
//   node scripts/gen-stacking.mjs <paramXmlDir>
// paramXmlDir must contain SpEffectParam.param.xml (WitchyBND export).
import fs from "node:fs";
import path from "node:path";
import { NR_EFFECTS } from "../src/data.js";

const [paramDir] = process.argv.slice(2);
if (!paramDir) {
  console.error("usage: node scripts/gen-stacking.mjs <paramXmlDir>");
  process.exit(1);
}

const xml = fs.readFileSync(path.join(paramDir, "SpEffectParam.param.xml"), "utf8");
const defaults = {};
for (const m of xml.matchAll(/<field name="(\w+)"[^>]*defaultValue="([^"]*)"/g)) defaults[m[1]] = m[2];
const rows = new Map();
for (const m of xml.matchAll(/<row ([^/]*)\/>/g)) {
  const o = {};
  for (const a of m[1].matchAll(/(\w+)="([^"]*)"/g)) o[a[1]] = a[2];
  rows.set(+o.id, o);
}
const val = (r, f) => +(r[f] ?? defaults[f] ?? 0);

const CHAIN = [
  "replaceSpEffectId", "cycleOccurrenceSpEffectId", "atkOccurrenceSpEffectId",
  "accumuOverFireId", "accumuUnderFireId", "applyIdOnGetSoul",
];
// Bookkeeping / targeting fields — a row with nothing else set does nothing itself.
const BOOK = new Set([
  "id", "iconId", "effectEndurance", "motionInterval", "spCategory", "categoryPriority",
  "saveCategory", "stateInfo", "spAttribute", "sortGroupId", "effectTextId",
  "deleteCriteriaDamage", "spEffectTextId_1", "spEffectTextId_2", ...CHAIN,
]);
const BOOK_RE = /^vfxId\d?$|^effectTarget|^disableParam|^bCurrHP|ParamChange$|Trigger|^is[A-Z]|^vowType|^veil|^dontDelete/;
const doesSomething = (r) =>
  Object.keys(r).some((f) => !BOOK.has(f) && !BOOK_RE.test(f) && r[f] !== defaults[f]);
const lasting = (r) => val(r, "effectEndurance") !== 0; // ∞ or timed, not instant

const named = new Map(NR_EFFECTS.map((r) => [r[0], r]));
const byName = new Map();
for (const r of NR_EFFECTS) {
  if (!byName.has(r[1])) byName.set(r[1], []);
  byName.get(r[1]).push(r[0]);
}

// First rows down the trigger chains that do something themselves.
function chainPayloads(id) {
  const out = [];
  const seen = new Set([id]);
  const walk = (x, depth) => {
    const row = rows.get(x);
    if (!row || depth > 3) return;
    for (const f of CHAIN) {
      const n = val(row, f);
      if (n <= 0 || seen.has(n) || !rows.has(n)) continue;
      seen.add(n);
      if (doesSomething(rows.get(n))) out.push(n);
      else walk(n, depth + 1);
    }
  };
  walk(id, 0);
  return out;
}

// A tier ladder: consecutive ids sharing one exclusive cat 2xx slot (cat +
// priority) whose values grow tier over tier — each tier replaces the last.
function ladderSize(id) {
  const r = rows.get(id);
  const cat = val(r, "spCategory"), prio = val(r, "categoryPriority");
  if (cat < 200 || cat > 299) return 1;
  const fields = Object.keys(r).filter((f) => !BOOK.has(f) && !BOOK_RE.test(f) && r[f] !== defaults[f]);
  let n = 1, prev = r;
  for (let k = id + 1; rows.has(k); k++) {
    const x = rows.get(k);
    if (val(x, "spCategory") !== cat || val(x, "categoryPriority") !== prio) break;
    const grows = fields.some((f) => {
      const a = val(prev, f), b = val(x, f), d = +(defaults[f] ?? 0);
      return Math.abs(b - d) > Math.abs(a - d);
    });
    if (!grows) break;
    n++;
    prev = x;
  }
  return n;
}

// id -> [cat, prio, payloadId, how, isTrigger]
const FIX = {};
for (const [id] of named) {
  const r = rows.get(id);
  if (!r || doesSomething(r)) continue;
  let payloads = chainPayloads(id).filter((p) => lasting(rows.get(p)));
  let how = "chain";
  if (!payloads.length) {
    // flags read by scripts: the payload rows carry the same community name,
    // or are reached through a same-named trigger row
    const sibs = (byName.get(named.get(id)[1]) || []).filter((s) => s !== id);
    payloads = sibs.filter((s) => doesSomething(rows.get(s)) && lasting(rows.get(s)));
    if (!payloads.length) payloads = sibs.flatMap(chainPayloads).filter((p) => lasting(rows.get(p)));
    how = "name";
  }
  if (!payloads.length) {
    // counter flags whose ladder (or the triggers into it) follow the flag's
    // id directly: 7060300 flag, 7060301… "- Stack N" tiers
    for (let k = id + 1; k <= id + 2 && rows.has(k); k++) {
      const x = rows.get(k);
      const cands = doesSomething(x) ? [k] : chainPayloads(k);
      payloads.push(...cands.filter((p) => lasting(rows.get(p)) && ladderSize(p) >= 3));
      if (doesSomething(x)) break; // a ladder starts here; k+1 is its next tier
    }
    how = "ladder";
  }
  if (!payloads.length) continue;
  // only trust a payload rule every candidate agrees on
  const rule = (p) => {
    const c = val(rows.get(p), "spCategory");
    return ladderSize(p) >= 3 ? "ladder" : c >= 100 && c <= 299 ? "excl:" + c + ":" + val(rows.get(p), "categoryPriority") : "c" + c;
  };
  if (new Set(payloads.map(rule)).size > 1) continue;
  const p = payloads[0];
  const pr = rows.get(p);
  if (ladderSize(p) >= 3) how = "ladder";
  const trigger = CHAIN.some((f) => val(r, f) > 0) ? 1 : 0;
  FIX[id] = [val(pr, "spCategory"), val(pr, "categoryPriority"), p, how, trigger];
}

const out = `// GENERATED by scripts/gen-stacking.mjs — do not edit by hand.
// Effects whose own SpEffectParam row is only a trigger/flag: the stacking rule
// that really applies comes from the row that carries the buff.
// id -> [spCategory, categoryPriority, payloadSpEffectId, how, isTrigger]
//   how: "chain"  = reached via replace/cycle/attack-occurrence fields
//        "name"   = script flag; payload rows share its name
//        "ladder" = payload is a tier ladder in one exclusive slot (one tier
//                   active; more copies of the source don't add tiers)
export const NR_STACK_FIX = ${JSON.stringify(FIX)};
`;
fs.writeFileSync(path.join(import.meta.dirname, "../src/stackdata.js"), out);
const counts = {};
for (const f of Object.values(FIX)) counts[f[3]] = (counts[f[3]] || 0) + 1;
console.log(`fixed ${Object.keys(FIX).length}`, counts);
