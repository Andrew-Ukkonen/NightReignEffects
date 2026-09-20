import { useMemo, useState } from "react";
import {
  NR_HEROES, NR_COLORS, NR_CONDS, CHANNELS, VESSELS, ROW_BY_ID,
  optimizeRolled, optimizeFixed, relevantConds, makeEffect, effectValue,
} from "../optimizer.js";
import { NR_COND_WEP } from "../relicdata.js";
import { WEP_NAME, cleanName } from "../model.js";

const COLOR_CLASS = ["c-red", "c-blue", "c-yellow", "c-green", "c-white"];
const COLOR_NAME = [...NR_COLORS, "White (any)"];

function EffectLine({ eff, weights, conds }) {
  const v = effectValue(eff, weights, conds);
  const mods = eff.spIds
    .map((id) => ROW_BY_ID.get(id))
    .filter(Boolean)
    .map((r) => r.mod)
    .filter((m) => m && !m.startsWith("scripted"));
  const needs = [
    ...new Set(
      eff.instances.flatMap(([, , , comps]) =>
        comps.filter(([, , c]) => c !== 0 && !conds.has(c)).map(([, , c]) => NR_CONDS[c])
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
  const [wepType, setWepType] = useState(0);
  const [condsOn, setCondsOn] = useState(() => new Set());
  const [baseDmg, setBaseDmg] = useState(1000);

  const heroVessels = useMemo(() => VESSELS.filter((v) => v.hero === hero), [hero]);
  const vessel =
    heroVessels.find((v) => v.id === vesselId) || heroVessels[0] || null;

  const weights = useMemo(
    () => CHANNELS.map((ch) => (elements.has(ch.key) ? 1 : 0)),
    [elements]
  );

  const condList = useMemo(
    () => relevantConds({ deep }).filter((c) => NR_COND_WEP[c.id] === 0),
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
    const s = new Set(condsOn);
    if (wepType) {
      NR_COND_WEP.forEach((w, i) => {
        if (w === wepType) s.add(i);
      });
    }
    return s;
  }, [condsOn, wepType]);

  const result = useMemo(() => {
    if (!weights.some((w) => w)) return null;
    return source === "rolled"
      ? optimizeRolled({ hero, deep, weights, conds })
      : vessel
        ? optimizeFixed({ hero, vessel, deep, weights, conds })
        : null;
  }, [hero, deep, source, vessel, weights, conds]);

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
          <p className="ptitle">Your damage type</p>
          <div className="chips" role="group" aria-label="Damage elements">
            {CHANNELS.map((ch, i) => (
              <button key={ch.key} type="button" className="chip"
                aria-pressed={elements.has(ch.key)}
                onClick={() => toggleSet(elements, ch.key, setElements)}>
                {ch.label}
              </button>
            ))}
          </div>
          {!weights.some((w) => w) && <p className="onote">Pick at least one element.</p>}
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
            Count conditional buffs
            {condsOn.size > 0 && (
              <button className="pclear" type="button" onClick={() => setCondsOn(new Set())}>
                clear
              </button>
            )}
          </p>
          <div className="checklist" role="group" aria-label="Conditions to include">
            {condList.map((c) => (
              <label key={c.id}>
                <input type="checkbox" checked={condsOn.has(c.id)}
                  onChange={() => toggleSet(condsOn, c.id, setCondsOn)} />
                {c.label}
              </label>
            ))}
          </div>
          <p className="onote">
            Unchecked conditions are treated as inactive and their buffs score ×1.
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
                (score averages your selected elements)
              </p>
            )}

            <div className="optrelics">
              {source === "rolled"
                ? result.relics.map((rel, i) => (
                    <section key={i} className="optrelic">
                      <h3>Relic {i + 1} <span className="osub">any Grand Scene relic</span></h3>
                      <ul>
                        {rel.map((eff, j) => (
                          <EffectLine key={j} eff={eff} weights={weights} conds={conds} />
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
                              <EffectLine key={j} eff={makeEffect(a)} weights={weights} conds={conds} />
                            ))
                          : <li className="onote">no damage gain available — any {COLOR_NAME[slotColors[i]]} relic works here</li>}
                      </ul>
                    </section>
                  ))}
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
                top priority, and duplicate refresh-type effects count once. A relic can carry an
                effect once, so a build can hold at most three copies of the same effect. "Best
                possible rolls" searches the random-relic effect pool ({deep ? "Deep" : "standard"}{" "}
                Scene relics — any effect can appear on any color); "Named relics" searches
                fixed-effect relics that fit the selected vessel's slot colors. Conditional buffs
                (initial attack, guard counters, weapon-count setups…) only count when you enable
                their condition. Flat attack bonuses, status-buildup scaling, and script-driven
                buffs without param data are not scored.
              </p>
            </details>
          </>
        )}
      </main>
    </div>
  );
}
