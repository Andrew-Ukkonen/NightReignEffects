import { useMemo, useRef, useState } from "react";
import FilterPanel from "./components/FilterPanel.jsx";
import EffectsTable from "./components/EffectsTable.jsx";
import EffectCards from "./components/EffectCards.jsx";
import RulesPanel from "./components/RulesPanel.jsx";
import Optimizer from "./components/Optimizer.jsx";
import { ROWS, passes, groupRows } from "./model.js";
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
  });
  const [limit, setLimit] = useState(PAGE);
  const [view, setView] = useState("effects"); // effects | optimizer
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
        if (r.weps === "*") weps["*"] = (weps["*"] || 0) + 1;
        else for (const w of r.weps) weps[w] = (weps[w] || 0) + 1;
      }
    }
    return { verdicts, weps, srcs, types };
  }, [f]);

  function updateFilters(patch) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setLimit(PAGE);
    boxRef.current?.scrollTo(0, 0);
  }

  function pickCategory(cat) {
    updateFilters({ groupCat: cat, query: "" });
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
        <button type="button" className="tab" aria-pressed={view === "optimizer"}
          onClick={() => setView("optimizer")}>Relic Optimizer</button>
      </nav>
      {view === "optimizer" && (
        <>
          <p className="sub">
            Finds the three-relic loadout with the biggest damage multiplier for your Nightfarer,
            using the game's own effect values and <b>spCategory</b> stacking rules — buffs that
            share an exclusivity group don't double-count.
          </p>
          <Optimizer />
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
                Showing exclusivity group: spCategory {filters.groupCat} — these{" "}
                {filtered.length} effects share one slot
                {filters.groupCat === 200 ? " per priority value" : ""}.
              </span>
              <button type="button" onClick={() => updateFilters({ groupCat: null })}>
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
              and spell effects — are marked <i>any weapon</i> and appear under the "Any weapon"
              filter option; enemy, world, and internal effects match no weapon filter. Relic
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
