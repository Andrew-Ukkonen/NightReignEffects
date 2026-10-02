import { useMemo, useRef, useState } from "react";
import FilterPanel from "./components/FilterPanel.jsx";
import EffectsTable from "./components/EffectsTable.jsx";
import EffectCards from "./components/EffectCards.jsx";
import RulesPanel from "./components/RulesPanel.jsx";
import RelicSelector from "./components/RelicSelector.jsx";
import { ROWS, passes, groupRows, kindAllows, perPriority, WEP_TYPES } from "./model.js";
import { NR_SP_KIND, NR_AOW_WEPS } from "./relicdata.js";
import { useMediaQuery } from "./hooks.js";

const PAGE = 400;

export default function App() {
  const [filters, setFilters] = useState({
    query: "",
    verdicts: new Set(),
    weps: new Set(),
    srcs: new Set(),
    types: new Set(),
    groupCat: null,
    groupPrio: null,
  });
  const [limit, setLimit] = useState(PAGE);
  // effects | selector — mirrored in the URL hash so the selector can be linked
  const [view, setViewState] = useState(() =>
    window.location.hash === "#selector" ? "selector" : "effects"
  );
  const setView = (v) => {
    setViewState(v);
    window.history.replaceState(null, "", v === "selector" ? "#selector" : window.location.pathname);
  };
  const boxRef = useRef(null);
  const isMobile = useMediaQuery("(max-width: 780px)");

  const f = useMemo(
    () => ({ ...filters, query: filters.query.trim().toLowerCase() }),
    [filters]
  );

  const filtered = useMemo(() => {
    const out = ROWS.filter((r) => passes(r, f, null));
    if (f.weps.size) {
      out.sort((a, b) => {
        const aa = a.weps === "*" ? 1 : 0, bb = b.weps === "*" ? 1 : 0;
        return aa - bb || a.id - b.id;
      });
    }
    return out;
  }, [f]);

  // Facet counts ignore their own facet so options stay discoverable.
  const counts = useMemo(() => {
    const verdicts = {}, weps = {}, srcs = {}, types = {};
    for (const r of ROWS) {
      if (passes(r, f, "v")) verdicts[r.v] = (verdicts[r.v] || 0) + 1;
      if (passes(r, f, "s")) for (const s of r.srcs) srcs[s] = (srcs[s] || 0) + 1;
      if (passes(r, f, "t")) for (const t of r.types) types[t] = (types[t] || 0) + 1;
      if (passes(r, f, "w")) {
        const aow = NR_AOW_WEPS[r.id];
        if (aow) for (const w of aow) weps[w] = (weps[w] || 0) + 1;
        else if (r.weps === "*") {
          for (const [w] of WEP_TYPES)
            if (kindAllows(NR_SP_KIND[r.id], w)) weps[w] = (weps[w] || 0) + 1;
        } else for (const w of r.weps) weps[w] = (weps[w] || 0) + 1;
      }
    }
    return { verdicts, weps, srcs, types };
  }, [f]);

  function updateFilters(patch) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setLimit(PAGE);
    boxRef.current?.scrollTo(0, 0);
  }

  // 200–299 groups are per priority: show only the slot the effect occupies
  function pickCategory(cat, prio) {
    updateFilters({ groupCat: cat, groupPrio: perPriority(cat) ? prio ?? null : null, query: "" });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  const groups = useMemo(() => groupRows(filtered), [filtered]);
  const shownGroups = groups.slice(0, limit);
  const shownCount = shownGroups.reduce((n, g) => n + g.members.length, 0);
  const wepNote = !f.weps.size
    ? ""
    : " — effects tied to the selected weapon types first, then every buff that can apply to them (melee-only, spell-only, and non-armament buffs are hidden where they can't work)";

  return (
    <div className="wrap">
      <h1>Nightreign Buff Stacking</h1>
      <nav className="tabs" aria-label="Views">
        <button type="button" className="tab" aria-pressed={view === "effects"}
          onClick={() => setView("effects")}>Effects</button>
        <button type="button" className="tab" aria-pressed={view === "selector"}
          onClick={() => setView("selector")}>Relic Selector</button>
      </nav>
      {view === "selector" && (
        <>
          <p className="sub">
            Build your relics line by line from every effect the game can roll — the selector only
            lets you make relics that can really exist — then simulate the damage for your
            Nightfarer, weapon, and the ailments you keep on the enemy, using the game's own
            effect values and <b>spCategory</b> stacking rules.
          </p>
          <RelicSelector />
        </>
      )}
      {view === "effects" && (
      <>
      <p className="sub">
        Every named special effect in Elden Ring Nightreign's <b>SpEffectParam</b> table (game
        version on disk, decoded 2026-09-18), with the engine field that decides stacking:{" "}
        <b>spCategory</b>. Effects sharing a non-zero category interact by that category's rule —
        see the "How stacking works" panel. Click a category number to see everything a buff
        conflicts with.
      </p>

      <div className="layout">
        <FilterPanel filters={filters} counts={counts} onChange={updateFilters} collapsible={isMobile} />

        <main className="main">
          {filters.groupCat !== null && (
            <div className="groupnote">
              <span>
                Showing exclusivity group: spCategory {filters.groupCat}
                {filters.groupPrio != null ? `, priority ${filters.groupPrio}` : ""} — these{" "}
                {filtered.length} effects share one slot
                {perPriority(filters.groupCat) && filters.groupPrio == null ? " per priority value" : ""}.
              </span>
              <button type="button" onClick={() => updateFilters({ groupCat: null, groupPrio: null })}>
                Clear group filter
              </button>
            </div>
          )}
          <p className="count" aria-live="polite">
            Showing {shownCount.toLocaleString()} of {filtered.length.toLocaleString()} effects
            in {shownGroups.length.toLocaleString()} rows ({ROWS.length.toLocaleString()} named total){wepNote}
          </p>
          {isMobile
            ? <EffectCards groups={shownGroups} onPickCategory={pickCategory} />
            : <EffectsTable groups={shownGroups} onPickCategory={pickCategory} boxRef={boxRef} />}
          {shownGroups.length < groups.length && (
            <button className="more" type="button" onClick={() => setLimit(limit + PAGE)}>
              Show more
            </button>
          )}
          <details className="foot">
            <summary>Method &amp; data notes</summary>
            <p>
              Method: <code>regulation.bin</code> unpacked with WitchyBND; <code>SpEffectParam</code>{" "}
              (13,472 rows) decoded against the Nightreign paramdef, showing the 4,747 rows with
              community names from the Smithbox/Paramdex project. Category semantics are the game's
              own <code>SP_EFFECT_SPCATEGORY</code> enum labels. Weapon-type tags mean a real weapon
              condition: innate effects of named obtainable weapons (<code>EquipParamWeapon</code>),
              weapon-class conditions on relic/passive effects (<code>AttachEffectFilterParam</code>,
              decoded against the game's weapon-class values), and <code>wepTypeTrigger</code> ("3+
              of type equipped" relics). Player buffs with no weapon condition — most relic, item,
              and spell effects — are marked <i>any weapon</i>; selecting a weapon type shows its
              tagged effects, the skill buffs of skills found on that weapon class
              (<code>SwordArtsParam</code> via <code>EquipParamWeapon</code>), and every any-weapon
              buff that can apply to it (melee-only, ranged-only, and spell-cast-only buffs are
              hidden where they can't work). Enemy, world, and internal effects match no weapon
              filter. Relic
              sourcing is traced through <code>EquipParamAntique</code> effect pools, so an effect
              can carry both Relic and Weapon-passive tags when both grant it. Duration ∞ means the
              effect lasts until removed by script or death. Value strings under each effect name
              are decoded from every non-default gameplay field of its SpEffectParam row: known
              stat fields get readable labels (rates shown as % change, negation inverted so
              "+" means less damage taken), uncertain multipliers are shown as ×N with their raw
              field name, and granted items/spells/skills are named via the Paramdex row names.
              "scripted (state N)" means the row carries no stat data itself — its behavior is
              triggered by that SP_EFFECT_TYPE state in the game's event scripts, so the actual
              numbers live outside SpEffectParam. Effects with no value line have nothing
              non-default beyond bookkeeping fields.
            </p>
          </details>
        </main>

        <RulesPanel />
      </div>
      </>
      )}
    </div>
  );
}
