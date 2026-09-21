import { useMemo, useState } from "react";
import {
  NR_HEROES, NR_COLORS, NR_CONDS, NR_WEAPONS, CHANNELS, STAT_NAMES, VESSELS, ROW_BY_ID,
  ATTACK_TYPES, optimizeRolled, optimizeFixed, relevantConds, makeEffect, effectValue,
  heroBaseStats, weaponWeights, weaponAR, damageByAttackType,
} from "../optimizer.js";
import { NR_COND_WEP, NR_COND_ATK } from "../relicdata.js";
import { WEP_NAME, WEP_TYPES, cleanName, kindAllows } from "../model.js";

const COLOR_CLASS = ["c-red", "c-blue", "c-yellow", "c-green", "c-white"];
const COLOR_NAME = [...NR_COLORS, "White (any)"];
const LEVELS = Array.from({ length: 15 }, (_, i) => i + 1);

function EffectLine({ eff, sc }) {
  const v = effectValue(eff, sc);
  const mods = eff.spIds
    .map((id) => ROW_BY_ID.get(id))
    .filter(Boolean)
    .map((r) => r.mod)
    .filter((m) => m && !m.startsWith("scripted"));
  const needs = [
    ...new Set(
      eff.instances.flatMap(([, , , comps]) =>
        comps.filter(([, , c]) => c !== 0 && !sc.conds.has(c)).map(([, , c]) => NR_CONDS[c])
      )
    ),
  ];
  return (
    <li>
      <div className="oline">
        <span className="oname">{cleanName(eff.name)}</span>
        {v > 1.0001 && <span className="oval">×{v.toFixed(3)}</span>}
      </div>
      {mods.length > 0 && <span className="mod">{mods.join(" · ")}</span>}
      {needs.length > 0 && <span className="oneeds">needs: {needs.join(", ")}</span>}
    </li>
  );
}

export default function Optimizer() {
  const [hero, setHero] = useState(0);
  const [deep, setDeep] = useState(false);
  const [source, setSource] = useState("rolled"); // rolled | fixed
  const [vesselId, setVesselId] = useState(null);
  const [elements, setElements] = useState(() => new Set(["phys"]));
  const [level, setLevel] = useState(15);
  const [wepClass, setWepClass] = useState(0);
  const [weaponId, setWeaponId] = useState(0);
  const [wepType, setWepType] = useState(0);
  // conditions are assumed active by default — this tracks the ones opted OUT
  const [condsOff, setCondsOff] = useState(() => new Set());
  const [baseDmg, setBaseDmg] = useState(1000);

  const heroVessels = useMemo(() => VESSELS.filter((v) => v.hero === hero), [hero]);
  const vessel =
    heroVessels.find((v) => v.id === vesselId) || heroVessels[0] || null;

  const stats = useMemo(() => heroBaseStats(hero, level), [hero, level]);

  const classWeapons = useMemo(
    () => NR_WEAPONS.filter((w) => w[2] === wepClass).sort((a, b) => a[1].localeCompare(b[1])),
    [wepClass]
  );
  const weapon = useMemo(
    () => (weaponId ? NR_WEAPONS.find((w) => w[0] === weaponId) || null : null),
    [weaponId]
  );

  const weights = useMemo(
    () =>
      weapon
        ? weaponWeights(weapon, stats)
        : CHANNELS.map((ch) => (elements.has(ch.key) ? 1 : 0)),
    [weapon, stats, elements]
  );

  // checklist holds only STATE conditions; attack kinds live in the
  // per-attack-type table and the "optimize for" selector
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
    if (wepType) {
      NR_COND_WEP.forEach((w, i) => {
        if (w === wepType) s.add(i);
      });
    }
    return s;
  }, [condList, condsOff, wepType]);

  const [atkLabel, setAtkLabel] = useState(null);
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

  const sc = useMemo(
    () => ({
      weights,
      conds: new Set([...conds, ...atkType.condIds]),
      stateConds: conds,
      weapon,
      stats,
      attackKind: atkType.kind,
    }),
    [weights, conds, weapon, stats, atkType]
  );

  const result = useMemo(() => {
    if (!weights.some((w) => w)) return null;
    return source === "rolled"
      ? optimizeRolled({ hero, deep, sc })
      : vessel
        ? optimizeFixed({ hero, vessel, deep, sc })
        : null;
  }, [hero, deep, source, vessel, sc, weights]);

  const toggleSet = (set, key, setter) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };

  const slotColors = vessel ? (deep ? vessel.deepSlots : vessel.slots) : [];

  return (
    <div className="optlayout">
      <aside className="side filtercol" aria-label="Optimizer settings">
        <div className="panel">
          <p className="ptitle">Nightfarer</p>
          <select
            value={hero}
            onChange={(e) => { setHero(+e.target.value); setVesselId(null); }}
            aria-label="Nightfarer"
          >
            {NR_HEROES.map((h, i) => (
              <option key={h} value={i}>{h}</option>
            ))}
          </select>
          <select
            style={{ marginTop: 8 }}
            value={level}
            onChange={(e) => setLevel(+e.target.value)}
            aria-label="Character level"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>Level {l}</option>
            ))}
          </select>
          <p className="onote">
            {STAT_NAMES.map((n, i) => `${n} ${stats[i]}`).join(" · ")}
          </p>
        </div>

        <div className="panel">
          <p className="ptitle">Relics</p>
          <div className="chips" role="group" aria-label="Relic source">
            <button type="button" className="chip" aria-pressed={source === "rolled"}
              onClick={() => setSource("rolled")}>Best possible rolls</button>
            <button type="button" className="chip" aria-pressed={source === "fixed"}
              onClick={() => setSource("fixed")}>Named relics only</button>
          </div>
          <div className="chips" role="group" aria-label="Expedition mode" style={{ marginTop: 8 }}>
            <button type="button" className="chip" aria-pressed={!deep}
              onClick={() => setDeep(false)}>Standard</button>
            <button type="button" className="chip" aria-pressed={deep}
              onClick={() => setDeep(true)}>Deep of Night</button>
          </div>
          {source === "fixed" && vessel && (
            <>
              <select
                style={{ marginTop: 10 }}
                value={vessel.id}
                onChange={(e) => setVesselId(+e.target.value)}
                aria-label="Vessel"
              >
                {heroVessels.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <div className="slotdots">
                {slotColors.map((c, i) => (
                  <span key={i} className={"slotdot " + COLOR_CLASS[c]} title={COLOR_NAME[c]} />
                ))}
                <span className="slotlabel">{slotColors.map((c) => COLOR_NAME[c]).join(" · ")}</span>
              </div>
            </>
          )}
        </div>

        <div className="panel">
          <p className="ptitle">Your damage</p>
          <select
            value={wepClass}
            onChange={(e) => { setWepClass(+e.target.value); setWeaponId(0); }}
            aria-label="Weapon class"
          >
            <option value={0}>No weapon — pick elements manually</option>
            {WEP_TYPES.map(([k, name]) => (
              <option key={k} value={k}>{name}</option>
            ))}
          </select>
          {wepClass !== 0 && (
            <select
              style={{ marginTop: 8 }}
              value={weaponId}
              onChange={(e) => setWeaponId(+e.target.value)}
              aria-label="Weapon"
            >
              <option value={0}>Pick a weapon…</option>
              {classWeapons.map((w) => (
                <option key={w[0]} value={w[0]}>{w[1]}</option>
              ))}
            </select>
          )}
          <select
            style={{ marginTop: 8 }}
            value={atkType.label}
            onChange={(e) => setAtkLabel(e.target.value)}
            aria-label="Optimize for attack type"
          >
            {atkOptions.map((t) => (
              <option key={t.label} value={t.label}>Optimize for: {t.label}</option>
            ))}
          </select>
          {weapon ? (
            <p className="onote">
              AR at these stats:{" "}
              {weaponAR(weapon, stats)
                .map((a, e) => (a > 0 ? `${CHANNELS[e].label} ${Math.round(a)}` : null))
                .filter(Boolean)
                .join(" · ")}
              . Stat relics (Str/Dex/Int/Fai/Arc) are valued through this weapon's
              scaling.
            </p>
          ) : (
            <>
              <div className="chips" role="group" aria-label="Damage elements" style={{ marginTop: 8 }}>
                {CHANNELS.map((ch) => (
                  <button key={ch.key} type="button" className="chip"
                    aria-pressed={elements.has(ch.key)}
                    onClick={() => toggleSet(elements, ch.key, setElements)}>
                    {ch.label}
                  </button>
                ))}
              </div>
              {!weights.some((w) => w) && <p className="onote">Pick at least one element.</p>}
              <p className="onote">
                Pick your weapon above to value attribute relics (Dexterity +3 …)
                through its real scaling.
              </p>
            </>
          )}
        </div>

        <div className="panel">
          <p className="ptitle">Weapon-count bonuses</p>
          <select value={wepType} onChange={(e) => setWepType(+e.target.value)}
            aria-label="Weapon type carried">
            <option value={0}>No 3+ weapon-type setup</option>
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
                setCondsOff(
                  condsOff.size < condList.length
                    ? new Set(condList.map((c) => c.id))
                    : new Set()
                )
              }>
              {condsOff.size < condList.length ? "uncheck all" : "check all"}
            </button>
          </p>
          <div className="checklist" role="group" aria-label="Conditions assumed active">
            {condList.map((c) => (
              <label key={c.id}>
                <input type="checkbox" checked={!condsOff.has(c.id)}
                  onChange={() => toggleSet(condsOff, c.id, setCondsOff)} />
                {c.label}
              </label>
            ))}
          </div>
          <p className="onote">
            Checked conditions are assumed to proc, so their buffs count at full value
            (e.g. Improved Initial Standard Attack = ×1.15 per relic); unchecked ones
            score ×1. These describe the hit you're optimizing — for the truest number,
            keep only conditions that can apply to the same attack.
          </p>
        </div>
      </aside>

      <main className="main optmain">
        {result && (
          <>
            <div className="optscore">
              <div>
                <span className="bigmult">×{result.score.toFixed(3)}</span>
                <span className="bigsub">expected damage vs. no relics</span>
              </div>
              <div className="dmgcalc">
                <label>
                  Base hit
                  <input type="number" min="1" value={baseDmg}
                    onChange={(e) => setBaseDmg(+e.target.value || 0)} />
                </label>
                <span className="arrow" aria-hidden="true">→</span>
                <span className="buffed">{Math.round(baseDmg * result.score).toLocaleString()}</span>
              </div>
            </div>
            {weights.filter(Boolean).length > 1 && (
              <p className="onote">
                Per element:{" "}
                {CHANNELS.map((ch, i) =>
                  weights[i] ? `${ch.label} ×${result.prod[i].toFixed(3)}` : null
                ).filter(Boolean).join(" · ")}{" "}
                ({weapon ? "weighted by this weapon's AR split" : "score averages your selected elements"})
              </p>
            )}
            {weapon && result.statDelta.some((d) => d) && (
              <p className="onote">
                Attribute bonuses in this build:{" "}
                {STAT_NAMES.map((n, i) =>
                  result.statDelta[i] ? `+${result.statDelta[i]} ${n}` : null
                ).filter(Boolean).join(", ")}{" "}
                — valued through {weapon[1]}'s scaling at your level-{level} stats.
              </p>
            )}

            <div className="optrelics">
              {source === "rolled"
                ? result.relics.map((rel, i) => (
                    <section key={i} className="optrelic">
                      <h3>Relic {i + 1} <span className="osub">any Grand Scene relic</span></h3>
                      <ul>
                        {rel.map((eff, j) => (
                          <EffectLine key={j} eff={eff} sc={sc} />
                        ))}
                        {rel.length === 0 && <li className="onote">free slot — nothing helps further</li>}
                      </ul>
                    </section>
                  ))
                : result.relics.map((rel, i) => (
                    <section key={i} className="optrelic">
                      <h3>
                        <span className={"slotdot " + COLOR_CLASS[slotColors[i]]} title={COLOR_NAME[slotColors[i]]} />{" "}
                        {rel ? rel[1] : "Open slot"}
                        <span className="osub">{COLOR_NAME[slotColors[i]]} slot</span>
                      </h3>
                      <ul>
                        {rel
                          ? rel[4].map((a, j) => (
                              <EffectLine key={j} eff={makeEffect(a)} sc={sc} />
                            ))
                          : <li className="onote">no damage gain available — any {COLOR_NAME[slotColors[i]]} relic works here</li>}
                      </ul>
                    </section>
                  ))}
            </div>

            <div className="atkbox">
              <p className="rulehead">Damage by attack type</p>
              <table className="atktable">
                <thead>
                  <tr><th>Attack type</th><th>Multiplier</th><th>Output</th></tr>
                </thead>
                <tbody>
                  {damageByAttackType(result.effects, sc).map((r) => (
                    <tr key={r.label}
                      className={r.label === atkType.label ? "atk-active" : undefined}>
                      <td>{r.label}{r.label === atkType.label ? " ◆" : ""}</td>
                      <td className="num">×{r.score.toFixed(3)}</td>
                      <td className="num">{Math.round(baseDmg * r.score).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="onote">
                Each row multiplies the base-hit value by the buffs that apply to that kind
                of hit (plus your checked state conditions). ◆ marks the hit the build was
                optimized for. "Output" assumes the same {baseDmg.toLocaleString()} base for
                every row — a real crit or charged attack has its own higher base damage.
              </p>
            </div>

            {result.dropped.length > 0 && (
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
              <summary>How this is calculated</summary>
              <p>
                Every relic effect's decoded <code>SpEffectParam</code> attack multipliers
                (physical / magic / fire / lightning / holy attack rate × attack power rate) are
                combined multiplicatively, after applying the engine's <code>spCategory</code>{" "}
                stacking rules — exclusive groups keep one effect, "highest wins" groups keep the
                top priority, and duplicate refresh-type effects count once. Suggested rolls obey
                the game's relic-generation rules (<code>compatibilityId</code>): effects sharing a
                compatibility group — the Attack Power category, character-exclusive effects,
                starting-armament affinity or skill changes, or tiers of the same ability — can
                never roll together on one relic, so a build holds at most three of a group, one
                per relic. "Best possible rolls" searches the random-relic effect pool
                ({deep ? "Deep" : "standard"} Scene relics — any effect can appear on any color);
                "Named relics" searches fixed-effect relics that fit the selected vessel's slot
                colors. Conditional buffs
                (initial attack, guard counters, weapon-count setups…) only count when you enable
                their condition. With a weapon selected, attribute relics (Strength, Dexterity,
                Intelligence, Faith, Arcane) are valued through the game's real attack-rating
                math — the weapon's scaling grades, its <code>CalcCorrectGraph</code> curves, and
                your Nightfarer's stats at the chosen level (<code>HeroStatusParam</code>) — so
                Dexterity on a dexterity-scaling weapon raises the score exactly as much as the
                AR formula says, with diminishing returns past the curves' soft caps. Weapon
                values are the listed rarity's unreinforced numbers. Flat attack bonuses,
                status-buildup scaling, and script-driven buffs without param data are not scored.
              </p>
            </details>
          </>
        )}
      </main>
    </div>
  );
}
