import { useMemo, useState } from "react";
import {
  NR_HEROES, NR_COLORS, NR_CONDS, CHANNELS, STAT_NAMES, VESSELS, ROW_BY_ID,
  ATTACK_TYPES, STATUSES, RELIC_BY_ID, relevantConds, makeEffect, effectValue, condLabel,
  heroBaseStats, weaponWeights, weaponAR, weaponStatusMask, damageByAttackType, simulate, evaluate,
  emptySlot, slotEffects, namedForSlot, lineOptions, curseOptions, validateSlot, fillBest,
  POOL_DEEP, HP_CONDS, RARITY, ARMAMENTS, WEAPON_BY_ID, emptyArm, armLines, armPicks,
  setArmPick, armEffects, armLineOptions, validateArm, weaponCanRoll,
} from "../optimizer.js";
import { NR_COND_WEP, NR_COND_ATK } from "../relicdata.js";
import { WEP_NAME, WEP_TYPES, cleanName, kindAllows } from "../model.js";
import { usePersistentState } from "../hooks.js";
import EffectPicker from "./EffectPicker.jsx";

const COLOR_CLASS = ["c-red", "c-blue", "c-yellow", "c-green", "c-white"];
const COLOR_NAME = [...NR_COLORS, "White (any)"];
const LEVELS = Array.from({ length: 15 }, (_, i) => i + 1);
const SIZE_NAME = ["Empty", "Delicate", "Polished", "Grand"];

const freshSlots = () => Array.from({ length: 6 }, emptySlot);
const freshArms = () => Array.from({ length: 6 }, emptyArm);
const ARM_LABEL = ["Right hand 1", "Right hand 2", "Right hand 3", "Left hand 1", "Left hand 2", "Left hand 3"];
function normalizeArms(a) {
  if (!Array.isArray(a) || a.length !== 6) return freshArms();
  return a.map((x) => (x && typeof x.id === "number" ? x : emptyArm()));
}
const shortName = (w) => w[1].replace(/^\[[^\]]*\]\s*/, "");
// Persisted loadouts from older versions may not match the current shape.
function normalizeSlots(s) {
  if (!Array.isArray(s) || s.length !== 6) return freshSlots();
  return s.map((x) =>
    x && Array.isArray(x.lines) && x.lines.length === 3 ? x : emptySlot()
  );
}

// Relic effects that inflict an ailment on enemies ("Starting armament inflicts
// frost", "Art Charge Activation Adds Poison Effect"), not self-buildup curses.
const INFLICTS = /inflicts?\b|adds .*effect/i;
const SELF_BUILDUP = /taking damage|below max hp|in vicinity/i;

function effectDetails(eff, sc) {
  const mods = eff.spIds
    .map((id) => ROW_BY_ID.get(id))
    .filter(Boolean)
    .map((r) => r.mod)
    .filter((m) => m && !m.startsWith("scripted"));
  const needs = [
    ...new Set(
      eff.instances.flatMap(([, , , comps]) =>
        comps
          .filter(([, , c]) => {
            if (c === 0) return false;
            if (c >= 1000) return !((c - 1000) & sc.statusMask);
            const hp = HP_CONDS.get(c);
            if (hp) return hp.below ? sc.hp > hp.pct : sc.hp < hp.pct;
            return !sc.conds.has(c);
          })
          .map(([, , c]) => condLabel(c))
      )
    ),
  ];
  return { mods, needs };
}

function LineInfo({ eff, sc, errors }) {
  const { mods, needs } = effectDetails(eff, sc);
  return (
    <>
      {mods.length > 0 && <span className="mod">{mods.join(" · ")}</span>}
      {needs.length > 0 && <span className="oneeds">needs: {needs.join(", ")}</span>}
      {errors.map((e, i) => <span key={i} className="oerr">✕ {e}</span>)}
    </>
  );
}

function SlotCard({ index, slot, color, deepSlot, hero, sc, validation, onChange }) {
  const named = deepSlot ? [] : namedForSlot(color, hero);
  const lineCount = slot.lines.filter((l) => l.a).length;
  const setLine = (i, patch) =>
    onChange({ ...slot, lines: slot.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const bad = validation.relic.length + validation.lines.flat().length + validation.curses.flat().length;
  const relic = slot.named ? RELIC_BY_ID.get(slot.relicId) : null;

  return (
    <section className={"optrelic" + (bad ? " invalid" : "")}>
      <h3>
        <span className={"slotdot " + COLOR_CLASS[color]} title={COLOR_NAME[color]} />
        {deepSlot ? "Deep relic" : "Relic"} {index + 1}
        <span className="osub">
          {COLOR_NAME[color]} slot
          {!slot.named && lineCount > 0 && ` · ${deepSlot ? "Deep " : ""}${SIZE_NAME[lineCount]} Scene`}
        </span>
        <button type="button" className="pclear" onClick={() => onChange(emptySlot())}>clear</button>
      </h3>
      {!deepSlot && (
        <div className="chips slotmode" role="group" aria-label="Relic kind">
          <button type="button" className="chip" aria-pressed={!slot.named}
            onClick={() => onChange({ ...slot, named: false })}>Rolled</button>
          <button type="button" className="chip" aria-pressed={slot.named}
            onClick={() => onChange({ ...slot, named: true })}>Named relic</button>
        </div>
      )}

      {slot.named ? (
        <>
          <select value={slot.relicId} aria-label="Named relic"
            onChange={(e) => onChange({ ...slot, relicId: +e.target.value })}>
            <option value={0}>Pick a named relic…</option>
            {relic && !named.includes(relic) && (
              <option value={relic[0]}>{relic[1]} (doesn't fit)</option>
            )}
            {named.map((r) => (
              <option key={r[0]} value={r[0]}>
                {r[1]}{color === 4 ? ` — ${NR_COLORS[r[2]]}` : ""}
              </option>
            ))}
          </select>
          {validation.relic.map((e, i) => <p key={i} className="oerr">✕ {e}</p>)}
          {relic && (
            <ul className="olines">
              {relic[4].map((a, j) => {
                const eff = makeEffect(a);
                const v = effectValue(eff, sc);
                return (
                  <li key={j}>
                    <div className="oline">
                      <span className="oname">{cleanName(eff.name)}</span>
                      {Math.abs(v - 1) > 1e-4 && <span className="oval">×{v.toFixed(3)}</span>}
                    </div>
                    <LineInfo eff={eff} sc={sc} errors={[]} />
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <ul className="olines">
          {slot.lines.map((l, i) => {
            const showPicker = i === 0 || slot.lines[i - 1].a || l.a;
            if (!showPicker) return null;
            const eff = l.a ? makeEffect(l.a) : null;
            const needsCurse = !!(deepSlot && l.a && POOL_DEEP.get(l.a)?.curse);
            return (
              <li key={i}>
                <EffectPicker
                  label={`Effect ${i + 1}`}
                  value={l.a}
                  placeholder={i === 0 ? "+ Pick an effect" : "+ Add another effect"}
                  options={lineOptions(slot, i, { hero, deepSlot, sc })}
                  onPick={(a) => setLine(i, { a, c: a ? l.c : 0 })}
                />
                {eff && <LineInfo eff={eff} sc={sc} errors={validation.lines[i]} />}
                {needsCurse && (
                  <div className="cursebox">
                    <span className="curselabel">Curse</span>
                    <EffectPicker
                      label={`Curse for effect ${i + 1}`}
                      value={l.c}
                      placeholder="+ Pick its curse"
                      options={curseOptions(slot, i, { sc })}
                      onPick={(c) => setLine(i, { c })}
                    />
                    {l.c ? (
                      <LineInfo eff={makeEffect(l.c)} sc={sc} errors={validation.curses[i]} />
                    ) : (
                      validation.curses[i].map((e, k) => <span key={k} className="oerr">✕ {e}</span>)
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ArmCard({ index, arm, deep, hero, sc, validation, attacking, onAttack, onChange }) {
  const weapon = WEAPON_BY_ID.get(arm.id) || null;
  const cls = weapon ? weapon[2] : arm.cls || 0;
  const classWeapons = cls ? ARMAMENTS.filter((w) => w[2] === cls) : [];
  const lines = armLines(weapon, deep);
  const picks = armPicks(arm, deep);
  const bad = validation.arm.length + validation.lines.flat().length;
  const fixed = weapon && weapon[8] ? makeEffect(weapon[8]) : null;
  const rarity = weapon ? (/^\[Hero\]/.test(weapon[1]) ? "Starting armament" : RARITY[weapon[7]]) : "Any weapon";
  const anyPicks = picks.some(Boolean);
  // the weapon choice keeps your passives; weapons that can't roll them say so
  const pickWeapon = (id) => onChange({ ...arm, cls, id });
  return (
    <section className={"optrelic" + (bad ? " invalid" : "") + (attacking ? " attacking" : "")}>
      <h3>
        {ARM_LABEL[index]}
        <span className="osub">{rarity}{weapon && ` · ${WEP_NAME[weapon[2]] || "type " + weapon[2]}`}</span>
        <span className="h3btns">
          {weapon && (
            <button type="button" className={"pclear" + (attacking ? " on" : "")} onClick={onAttack}
              aria-pressed={attacking} title="Simulate attacks with this weapon">
              {attacking ? "attacking ◆" : "attack with"}
            </button>
          )}
          <button type="button" className="pclear" onClick={() => onChange(emptyArm())}>clear</button>
        </span>
      </h3>
      <select value={cls} aria-label={`${ARM_LABEL[index]} weapon class`}
        onChange={(e) => onChange({ ...arm, cls: +e.target.value, id: 0 })}>
        <option value={0}>Any weapon class (optional)</option>
        {WEP_TYPES.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
      </select>
      {cls !== 0 && (
        <select value={arm.id} aria-label={`${ARM_LABEL[index]} weapon`}
          onChange={(e) => pickWeapon(+e.target.value)}>
          <option value={0}>Any {WEP_NAME[cls] || "weapon"} (optional)</option>
          {classWeapons.map((w) => (
            <option key={w[0]} value={w[0]}>
              {w[1]}{anyPicks && !weaponCanRoll(w, picks, deep) ? " — can't roll these passives" : ""}
            </option>
          ))}
        </select>
      )}
      {validation.arm.map((e, i) => <p key={i} className="oerr">✕ {e}</p>)}
      <ul className="olines">
          {fixed && (
            <li>
              <div className="oline">
                <span className="oname">{cleanName(fixed.name)}</span>
                {Math.abs(effectValue(fixed, sc) - 1) > 1e-4 && (
                  <span className="oval">×{effectValue(fixed, sc).toFixed(3)}</span>
                )}
              </div>
              <span className="picktag">fixed passive</span>
              <LineInfo eff={fixed} sc={sc} errors={[]} />
            </li>
          )}
          {lines.map((l, i) => {
            const eff = picks[i] ? makeEffect(picks[i]) : null;
            const picker = (
              <EffectPicker
                label={`${ARM_LABEL[index]} ${l.penalty ? "penalty" : "passive " + (i + 1)}`}
                value={picks[i]}
                placeholder={l.penalty ? "+ Pick its penalty" : "+ Pick a passive"}
                options={armLineOptions(arm, i, { hero, deep, sc })}
                onPick={(a) => onChange(setArmPick(arm, deep, i, a))}
              />
            );
            const info = eff
              ? <LineInfo eff={eff} sc={sc} errors={validation.lines[i]} />
              : validation.lines[i].map((e, k) => <span key={k} className="oerr">✕ {e}</span>);
            return (
              <li key={i}>
                {l.penalty ? (
                  <div className="cursebox">
                    <span className="curselabel">Penalty</span>
                    {picker}
                    {info}
                  </div>
                ) : (
                  <>{picker}{info}</>
                )}
              </li>
            );
          })}
          {weapon && !lines.length && !fixed && <li className="onote">This weapon rolls no passives.</li>}
      </ul>
    </section>
  );
}

export default function RelicSelector() {
  const [hero, setHero] = usePersistentState("nrs.hero", 0);
  const [level, setLevel] = usePersistentState("nrs.level", 15);
  const [deep, setDeep] = usePersistentState("nrs.deep", false);
  const [vesselId, setVesselId] = usePersistentState("nrs.vessel", null);
  const [rawSlots, setSlots] = usePersistentState("nrs.slots", freshSlots);
  const slots = useMemo(() => normalizeSlots(rawSlots), [rawSlots]);
  const [elements, setElements] = useState(() => new Set(["phys"]));
  // the earlier single-weapon picker's choice seeds Right hand 1
  const [legacyWeapon] = usePersistentState("nrs.weapon", 0);
  const [rawArms, setArms] = usePersistentState("nrs.arms", () => {
    const a = freshArms();
    if (WEAPON_BY_ID.has(legacyWeapon)) a[0] = { ...a[0], id: legacyWeapon };
    return a;
  });
  const arms = useMemo(() => normalizeArms(rawArms), [rawArms]);
  const [atkArm, setAtkArm] = usePersistentState("nrs.atkArm", 0);
  const [hp, setHp] = usePersistentState("nrs.hp", 100);
  const [wepType, setWepType] = usePersistentState("nrs.wepType", 0);
  // conditions are assumed active by default — this tracks the ones opted OUT
  const [condsOffList, setCondsOffList] = usePersistentState("nrs.condsOff", []);
  const condsOff = useMemo(() => new Set(condsOffList), [condsOffList]);
  const [baseDmg, setBaseDmg] = usePersistentState("nrs.base", 1000);
  // ailment toggles the user set by hand (otherwise: on if the build inflicts it)
  const [statusSet, setStatusSet] = usePersistentState("nrs.status", {});
  const [uptime, setUptime] = usePersistentState("nrs.uptime", {});
  const [atkLabel, setAtkLabel] = usePersistentState("nrs.atk", null);

  const heroVessels = useMemo(() => VESSELS.filter((v) => v.hero === hero), [hero]);
  const vessel = heroVessels.find((v) => v.id === vesselId) || heroVessels[0] || null;
  const slotColors = vessel ? [...vessel.slots, ...vessel.deepSlots] : [4, 4, 4, 4, 4, 4];
  const activeCount = deep ? 6 : 3;

  const stats = useMemo(() => heroBaseStats(hero, level), [hero, level]);
  const armWeapons = arms.map((a) => WEAPON_BY_ID.get(a.id) || null);
  // simulate the chosen hand, or the first filled slot
  const atkIndex = armWeapons[atkArm] ? atkArm : armWeapons.findIndex(Boolean);
  const weapon = atkIndex >= 0 ? armWeapons[atkIndex] : null;
  // weapon classes carried 3+ times switch on "3+ X equipped" buffs
  const carriedTypes = useMemo(() => {
    const n = new Map();
    arms.forEach((a, i) => {
      const t = armWeapons[i]?.[2] || a.cls; // a class alone counts too
      if (t) n.set(t, (n.get(t) || 0) + 1);
    });
    return new Set([...n].filter(([, c]) => c >= 3).map(([t]) => t));
  }, [arms]);
  const weights = useMemo(
    () =>
      weapon
        ? weaponWeights(weapon, stats)
        : CHANNELS.map((ch) => (elements.has(ch.key) ? 1 : 0)),
    [weapon, stats, elements]
  );

  // checklist holds only STATE conditions; attack kinds live in the
  // per-attack-type table and the attack selector
  const condList = useMemo(
    () => relevantConds({ deep }).filter((c) => NR_COND_WEP[c.id] === 0 && !NR_COND_ATK[c.id]),
    [deep]
  );
  const wepOptions = useMemo(() => {
    const ids = new Set();
    for (const c of relevantConds({ deep })) {
      const w = NR_COND_WEP[c.id];
      if (w) ids.add(w);
    }
    return [...ids].sort((a, b) => a - b);
  }, [deep]);
  const conds = useMemo(() => {
    const s = new Set();
    for (const c of condList) if (!condsOff.has(c.id)) s.add(c.id);
    NR_COND_WEP.forEach((w, i) => {
      if (!w) return;
      const count = /^\d+\+ /.test(NR_CONDS[i]);
      // "3+ X equipped": from the carried weapons (or the manual setup);
      // "wielding X": the weapon being simulated
      if (count ? carriedTypes.has(w) || w === wepType : w === weapon?.[2] || w === wepType) s.add(i);
    });
    return s;
  }, [condList, condsOff, wepType, carriedTypes, weapon]);

  const atkOptions = useMemo(
    () =>
      weapon
        ? ATTACK_TYPES.filter(
            (t) => t.kind === "*" || t.kind === "n" || kindAllows(t.kind, weapon[2])
          )
        : ATTACK_TYPES,
    [weapon]
  );
  const atkType = atkOptions.find((t) => t.label === atkLabel) || atkOptions[0];

  const activeSlots = useMemo(() => slots.slice(0, activeCount), [slots, activeCount]);
  const relicEffects = useMemo(() => activeSlots.flatMap(slotEffects), [activeSlots]);
  const weaponEffects = useMemo(() => arms.flatMap((a) => armEffects(a, deep)), [arms, deep]);
  const effects = useMemo(() => [...relicEffects, ...weaponEffects], [relicEffects, weaponEffects]);

  // ---- status inflicters ----
  const inflicters = useMemo(() => {
    const src = STATUSES.map(() => []);
    for (const w of armWeapons) {
      if (!w) continue;
      const wm = weaponStatusMask(w);
      STATUSES.forEach((s, i) => { if (wm & s.bit) src[i].push(shortName(w)); });
    }
    const scan = (list, label) => {
      for (const e of list) {
        if (!INFLICTS.test(e.name) || SELF_BUILDUP.test(e.name)) continue;
        STATUSES.forEach((s, i) => { if (s.inflict.test(e.name)) src[i].push(label); });
      }
    };
    scan(relicEffects, "relic");
    scan(weaponEffects, "weapon passive");
    return src.map((l) => [...new Set(l)]);
  }, [arms, relicEffects, weaponEffects]);
  const statusOn = STATUSES.map((s, i) =>
    s.key in statusSet ? statusSet[s.key] : inflicters[i].length > 0
  );
  const statusList = STATUSES
    .map((s, i) => ({ ...s, uptime: (uptime[s.key] ?? 100) / 100, on: statusOn[i] }))
    .filter((s) => s.on);
  const statusMask = statusList.reduce((m, s) => m | s.bit, 0);
  const statusKey = statusList.map((s) => s.key + s.uptime).join();

  const sc = useMemo(
    () => ({
      weights,
      conds: new Set([...conds, ...atkType.condIds]),
      stateConds: conds,
      weapon,
      stats,
      attackKind: atkType.kind,
      statusMask,
      hp,
    }),
    [weights, conds, weapon, stats, atkType, statusMask, hp]
  );

  // statusList is rebuilt every render; key the memo on its content
  const statuses = useMemo(() => statusList, [statusKey]);
  const result = useMemo(
    () => (weights.some((w) => w) ? simulate(effects, sc, statuses) : null),
    [effects, sc, statuses, weights]
  );

  const validations = slots.map((slot, i) => {
    const namedElsewhere = new Set(
      activeSlots.filter((s, j) => j !== i && s.named && s.relicId).map((s) => s.relicId)
    );
    return validateSlot(slot, { hero, color: slotColors[i], deepSlot: i >= 3, namedElsewhere });
  });
  const armValidations = arms.map((a) => validateArm(a, { hero, deep }));
  const problems =
    validations
      .slice(0, activeCount)
      .reduce((n, v) => n + v.relic.length + v.lines.flat().length + v.curses.flat().length, 0) +
    armValidations.reduce((n, v) => n + v.arm.length + v.lines.flat().length, 0);

  const statusRows = useMemo(() => {
    if (!result || !statuses.length) return [];
    const at = (mask) => evaluate(effects, { ...sc, statusMask: mask }).score;
    const rows = [{ label: "No ailment", score: at(0) }];
    for (const s of statuses) rows.push({ label: s.label + " only", score: at(s.bit) });
    if (statuses.length > 1) rows.push({ label: "All inflicted", score: at(statusMask) });
    return rows;
  }, [result, statuses, effects, sc, statusMask]);

  const setSlot = (i, s) => setSlots(slots.map((x, j) => (j === i ? s : x)));
  const setArm = (i, a) => setArms(arms.map((x, j) => (j === i ? a : x)));
  const fill = () => {
    const r = fillBest(slots, { hero, deepSlots: deep, sc, statuses, arms });
    setSlots(r.slots);
    setArms(r.arms);
  };
  const toggleCond = (id) => {
    const next = new Set(condsOff);
    next.has(id) ? next.delete(id) : next.add(id);
    setCondsOffList([...next]);
  };
  const toggleElement = (key) => {
    const next = new Set(elements);
    next.has(key) ? next.delete(key) : next.add(key);
    setElements(next);
  };

  const effectsUsingStatus = (bit) =>
    effects.filter((e) => e.statusMask & bit).length;

  return (
    <div className="optlayout">
      <aside className="side filtercol" aria-label="Selector settings">
        <div className="panel">
          <p className="ptitle">Nightfarer</p>
          <select value={hero} aria-label="Nightfarer"
            onChange={(e) => { setHero(+e.target.value); setVesselId(null); }}>
            {NR_HEROES.map((h, i) => <option key={h} value={i}>{h}</option>)}
          </select>
          <select style={{ marginTop: 8 }} value={level} aria-label="Character level"
            onChange={(e) => setLevel(+e.target.value)}>
            {LEVELS.map((l) => <option key={l} value={l}>Level {l}</option>)}
          </select>
          <p className="onote">{STAT_NAMES.map((n, i) => `${n} ${stats[i]}`).join(" · ")}</p>
        </div>

        <div className="panel">
          <p className="ptitle">Vessel</p>
          <div className="chips" role="group" aria-label="Expedition mode">
            <button type="button" className="chip" aria-pressed={!deep}
              onClick={() => setDeep(false)}>Standard</button>
            <button type="button" className="chip" aria-pressed={deep}
              onClick={() => setDeep(true)}>Deep of Night</button>
          </div>
          {vessel && (
            <>
              <select style={{ marginTop: 10 }} value={vessel.id} aria-label="Vessel"
                onChange={(e) => setVesselId(+e.target.value)}>
                {heroVessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <div className="slotdots">
                {slotColors.slice(0, activeCount).map((c, i) => (
                  <span key={i} className={"slotdot " + COLOR_CLASS[c] + (i >= 3 ? " deepdot" : "")}
                    title={(i >= 3 ? "Deep " : "") + COLOR_NAME[c]} />
                ))}
              </div>
            </>
          )}
          {deep && (
            <p className="onote">Deep of Night adds the vessel's three Deep slots, which take Deep relics.</p>
          )}
        </div>

        <div className="panel">
          <p className="ptitle">Your damage</p>
          {weapon ? (
            <select value={atkIndex} aria-label="Attack with"
              onChange={(e) => setAtkArm(+e.target.value)}>
              {armWeapons.map((w, i) =>
                w ? <option key={i} value={i}>Attack with: {shortName(w)} ({ARM_LABEL[i]})</option> : null
              )}
            </select>
          ) : (
            <p className="onote" style={{ marginTop: 0 }}>
              Add a weapon under Armaments to value its scaling, or pick damage elements below.
            </p>
          )}
          <select style={{ marginTop: 8 }} value={atkType.label} aria-label="Attack to simulate"
            onChange={(e) => setAtkLabel(e.target.value)}>
            {atkOptions.map((t) => <option key={t.label} value={t.label}>Simulate: {t.label}</option>)}
          </select>
          {weapon ? (
            <p className="onote">
              AR at these stats:{" "}
              {weaponAR(weapon, stats)
                .map((a, e) => (a > 0 ? `${CHANNELS[e].label} ${Math.round(a)}` : null))
                .filter(Boolean)
                .join(" · ")}
              . Stat relics are valued through this weapon's scaling.
            </p>
          ) : (
            <>
              <div className="chips" role="group" aria-label="Damage elements" style={{ marginTop: 8 }}>
                {CHANNELS.map((ch) => (
                  <button key={ch.key} type="button" className="chip"
                    aria-pressed={elements.has(ch.key)} onClick={() => toggleElement(ch.key)}>
                    {ch.label}
                  </button>
                ))}
              </div>
              {!weights.some((w) => w) && <p className="onote">Pick at least one element.</p>}
            </>
          )}
        </div>

        <div className="panel">
          <p className="ptitle">
            Status inflicter
            {Object.keys(statusSet).length > 0 && (
              <button className="pclear" type="button" onClick={() => setStatusSet({})}>auto</button>
            )}
          </p>
          <div className="statuslist">
            {STATUSES.map((s, i) => {
              const on = statusOn[i];
              const uses = effectsUsingStatus(s.bit);
              return (
                <div key={s.key} className="statusrow">
                  <button type="button" className="chip" aria-pressed={on}
                    onClick={() => setStatusSet({ ...statusSet, [s.key]: !on })}>
                    {s.label}
                  </button>
                  <span className="statusnote">
                    {inflicters[i].length > 0 && <>via {inflicters[i].join(", ")}</>}
                    {uses > 0 && <>{inflicters[i].length > 0 ? " · " : ""}powers {uses} effect{uses > 1 ? "s" : ""}</>}
                    {s.debuff && <>{inflicters[i].length || uses ? " · " : ""}enemy takes ×{s.debuff}</>}
                  </span>
                  {on && (
                    <label className="uptime">
                      <input type="range" min="0" max="100" step="5"
                        value={uptime[s.key] ?? 100}
                        onChange={(e) => setUptime({ ...uptime, [s.key]: +e.target.value })}
                        aria-label={`${s.label} uptime`} />
                      <span>{uptime[s.key] ?? 100}% uptime</span>
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          <p className="onote">
            Ailments you keep on the enemy. They switch on relic buffs keyed to them
            ("…facing poison-afflicted enemy", "Sleep in Vicinity…"), and frostbite
            itself makes the target take ×1.15 damage. Inflicters in your build (Cold /
            Poison weapons, "Starting armament inflicts…") turn their ailment on
            automatically; uptime averages the damage over the fight.
          </p>
        </div>

        <div className="panel">
          <p className="ptitle">Your HP</p>
          <label className="uptime">
            <input type="range" min="1" max="100" value={hp}
              onChange={(e) => setHp(+e.target.value)} aria-label="Current HP percent" />
            <span>{hp === 100 ? "Full HP" : `${hp}% HP`}</span>
          </label>
          <p className="onote">
            Drives "at full HP" and "at low HP" buffs (and "below max HP" penalties).
          </p>
        </div>

        <div className="panel">
          <p className="ptitle">Weapon-count bonuses</p>
          {carriedTypes.size > 0 && (
            <p className="onote" style={{ marginTop: 0 }}>
              From your armaments: {[...carriedTypes].map((t) => `3+ ${WEP_NAME[t] || "type " + t}`).join(", ")}
            </p>
          )}
          <select value={wepType} onChange={(e) => setWepType(+e.target.value)}
            aria-label="Weapon type carried">
            <option value={0}>No extra 3+ weapon-type setup</option>
            {wepOptions.map((w) => (
              <option key={w} value={w}>3+ {WEP_NAME[w] || "type " + w}</option>
            ))}
          </select>
        </div>

        <div className="panel">
          <p className="ptitle">
            Buff conditions
            <button className="pclear" type="button"
              onClick={() =>
                setCondsOffList(condsOff.size < condList.length ? condList.map((c) => c.id) : [])
              }>
              {condsOff.size < condList.length ? "uncheck all" : "check all"}
            </button>
          </p>
          <div className="checklist" role="group" aria-label="Conditions assumed active">
            {condList.map((c) => (
              <label key={c.id}>
                <input type="checkbox" checked={!condsOff.has(c.id)} onChange={() => toggleCond(c.id)} />
                {c.label}
              </label>
            ))}
          </div>
          <p className="onote">
            Checked conditions are assumed to proc, so their buffs count at full value;
            unchecked ones score ×1.
          </p>
        </div>
      </aside>

      <main className="main optmain">
        {result && (
          <div className="optscore">
            <div>
              <span className="bigmult">×{result.expected.toFixed(3)}</span>
              <span className="bigsub">
                {atkType.label.toLowerCase()} vs. no relics
                {statuses.some((s) => s.uptime < 1) &&
                  ` · ×${result.score.toFixed(3)} while every ailment is up`}
              </span>
            </div>
            <div className="dmgcalc">
              <label>
                Base hit
                <input type="number" min="1" value={baseDmg}
                  onChange={(e) => setBaseDmg(+e.target.value || 0)} />
              </label>
              <span className="arrow" aria-hidden="true">→</span>
              <span className="buffed">{Math.round(baseDmg * result.expected).toLocaleString()}</span>
            </div>
          </div>
        )}

        <div className="loadbar">
          <span className={problems ? "oerr" : "ook"} aria-live="polite">
            {problems
              ? `✕ ${problems} problem${problems > 1 ? "s" : ""} — this loadout can't exist in-game`
              : effects.length
                ? "✓ Every relic and weapon passive is a legal roll"
                : "Pick relic effects and weapons, or let the selector fill empty lines."}
          </span>
          <button type="button" className="chip" onClick={fill}>
            Fill empty lines with best damage
          </button>
          <button type="button" className="chip"
            onClick={() => { setSlots(freshSlots()); setArms(freshArms()); }}>
            Clear all
          </button>
        </div>

        <div className="optrelics">
          {slots.slice(0, 3).map((slot, i) => (
            <SlotCard key={i} index={i} slot={slot} color={slotColors[i]} deepSlot={false}
              hero={hero} sc={sc} validation={validations[i]} onChange={(s) => setSlot(i, s)} />
          ))}
        </div>
        {deep && (
          <>
            <p className="rulehead deephead">Deep relics</p>
            <div className="optrelics">
              {slots.slice(3).map((slot, i) => (
                <SlotCard key={i} index={i} slot={slot} color={slotColors[i + 3]} deepSlot
                  hero={hero} sc={sc} validation={validations[i + 3]}
                  onChange={(s) => setSlot(i + 3, s)} />
              ))}
            </div>
          </>
        )}

        <p className="rulehead deephead">Armaments</p>
        <div className="optrelics">
          {arms.map((arm, i) => (
            <ArmCard key={i} index={i} arm={arm} deep={deep} hero={hero} sc={sc}
              validation={armValidations[i]} attacking={i === atkIndex}
              onAttack={() => setAtkArm(i)} onChange={(a) => setArm(i, a)} />
          ))}
        </div>
        <p className="onote">
          Every carried weapon's passives count whether it's in hand or not; the
          ◆ weapon is the one whose attack rating and class the simulation uses.
          Duplicate passives across weapons follow the same stacking rules as relics.
        </p>

        {result && weights.filter(Boolean).length > 1 && (
          <p className="onote">
            Per element:{" "}
            {CHANNELS.map((ch, i) =>
              weights[i] ? `${ch.label} ×${result.prod[i].toFixed(3)}` : null
            ).filter(Boolean).join(" · ")}{" "}
            ({weapon ? "weighted by this weapon's AR split" : "averages your selected elements"})
          </p>
        )}
        {result && weapon && result.statDelta.some((d) => d) && (
          <p className="onote">
            Attribute changes in this build:{" "}
            {STAT_NAMES.map((n, i) =>
              result.statDelta[i] ? `${result.statDelta[i] > 0 ? "+" : ""}${result.statDelta[i]} ${n}` : null
            ).filter(Boolean).join(", ")}{" "}
            — valued through {weapon[1]}'s scaling at your level-{level} stats.
          </p>
        )}

        {statusRows.length > 0 && (
          <div className="atkbox">
            <p className="rulehead">Status simulation — {atkType.label.toLowerCase()}</p>
            <table className="atktable">
              <thead><tr><th>Enemy state</th><th>Multiplier</th><th>Output</th></tr></thead>
              <tbody>
                {statusRows.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className="num">×{r.score.toFixed(3)}</td>
                    <td className="num">{Math.round(baseDmg * r.score).toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="atk-active">
                  <td>Expected over the fight</td>
                  <td className="num">×{result.expected.toFixed(3)}</td>
                  <td className="num">{Math.round(baseDmg * result.expected).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            <p className="onote">
              Each ailment is assumed to be up for its uptime share of the fight,
              independently of the others; "expected" averages every on/off combination.
            </p>
          </div>
        )}

        {result && (
          <div className="atkbox">
            <p className="rulehead">Damage by attack type</p>
            <table className="atktable">
              <thead><tr><th>Attack type</th><th>Multiplier</th><th>Output</th></tr></thead>
              <tbody>
                {damageByAttackType(effects, sc, statuses).map((r) => (
                  <tr key={r.label} className={r.label === atkType.label ? "atk-active" : undefined}>
                    <td>{r.label}{r.label === atkType.label ? " ◆" : ""}</td>
                    <td className="num">×{r.score.toFixed(3)}</td>
                    <td className="num">{Math.round(baseDmg * r.score).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="onote">
              Each row multiplies the base hit by the buffs that apply to that kind of hit,
              your checked conditions, and the expected ailment uptime. ◆ marks the attack
              being simulated. "Output" uses the same {baseDmg.toLocaleString()} base for every
              row — a real crit or charged attack has its own higher base damage.
            </p>
          </div>
        )}

        {result && result.dropped.length > 0 && (
          <details className="foot">
            <summary>Stacking conflicts ({result.dropped.length})</summary>
            <ul className="odropped">
              {result.dropped.map((d, i) => (
                <li key={i}>
                  {(ROW_BY_ID.get(d.inst[0])?.name) || "effect " + d.inst[0]} — {d.reason}
                </li>
              ))}
            </ul>
          </details>
        )}

        <details className="foot">
          <summary>Relic rules &amp; how damage is calculated</summary>
          <p>
            <b>Legal relics.</b> Rolled relics hold up to three effect lines (Delicate, Polished,
            Grand) drawn from the game's random-relic tables (<code>AttachEffectTableParam</code>):
            normal Scene relics roll from table 110 (any effect on any color), Deep relics from table 2100000 or from the Deep-exclusive table 2000000, whose
            lines always come paired with a curse from table 3000000. Two effects sharing a{" "}
            <code>compatibilityId</code> — the Attack Power category, character-exclusive
            effects, starting-armament affinity or skill changes, or tiers of the same ability —
            can never roll on the same relic, and character-exclusive effects only exist for that
            Nightfarer. Named relics have fixed effects and must match the slot's color (white
            slots take any).
          </p>
          <p>
            <b>Legal weapons.</b> A dropped weapon (<code>EquipParamCustomWeapon</code>) rolls
            one passive line in Standard expeditions, from its class group and rarity: Common,
            Uncommon and Rare weapons roll Potency 1, 2 and 3 tiers. In Deep of Night, Uncommon
            and Rare weapons instead roll two passives — the second from a pool with extra
            stat lines — plus a mandatory penalty. Legendaries carry only their fixed Weapon
            Power, and starting armaments roll from their Nightfarer's own small tables. Torches
            and ranged weapons, catalysts included, can't roll the on-hit proc passives. The
            same compatibility rule as relics keeps two passives of one group off a weapon.
          </p>
          <p>
            <b>Damage.</b> Every effect's decoded <code>SpEffectParam</code> attack multipliers
            are combined multiplicatively after the engine's <code>spCategory</code> stacking
            rules (exclusive groups keep one effect, "highest wins" keeps the top priority,
            duplicate refresh-type effects count once). Attribute relics and curses (Strength,
            Dexterity…) go through the weapon's real attack-rating math: scaling grades,{" "}
            <code>CalcCorrectGraph</code> curves and your Nightfarer's stats at the chosen level.
            Ailment-keyed buffs count only while their ailment is inflicted, and frostbite's own
            debuff (every damage cut rate ×1.15 on the target) multiplies every hit. Flat attack
            bonuses, status-buildup scaling and script-driven buffs without param data are not
            scored.
          </p>
        </details>
      </main>
    </div>
  );
}
