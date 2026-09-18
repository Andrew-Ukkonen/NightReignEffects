import { useMemo, useRef, useState } from "react";
import FilterPanel from "./components/FilterPanel.jsx";
import EffectsTable from "./components/EffectsTable.jsx";
import RulesPanel from "./components/RulesPanel.jsx";
import { ROWS, passes } from "./model.js";

const PAGE = 400;

export default function App() {
  const [filters, setFilters] = useState({
    query: "",
    verdicts: new Set(),
    weps: new Set(),
    srcs: new Set(),
    groupCat: null,
  });
  const [limit, setLimit] = useState(PAGE);
  const boxRef = useRef(null);

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
    const verdicts = {}, weps = {}, srcs = {};
    for (const r of ROWS) {
      if (passes(r, f, "v")) verdicts[r.v] = (verdicts[r.v] || 0) + 1;
      if (passes(r, f, "s")) for (const s of r.srcs) srcs[s] = (srcs[s] || 0) + 1;
      if (passes(r, f, "w")) {
        if (r.weps === "*") weps["*"] = (weps["*"] || 0) + 1;
        else for (const w of r.weps) weps[w] = (weps[w] || 0) + 1;
      }
    }
    return { verdicts, weps, srcs };
  }, [f]);

  function updateFilters(patch) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setLimit(PAGE);
    boxRef.current?.scrollTo(0, 0);
  }

  function pickCategory(cat) {
    updateFilters({ groupCat: cat, query: "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const shown = filtered.slice(0, limit);
  const wepNote = !f.weps.size
    ? ""
    : f.weps.has("*")
      ? " — effects tied to the selected weapon types first, then any-weapon buffs"
      : " — only effects tied to the selected weapon types (check “Any weapon” to include unrestricted buffs)";

  return (
    <div className="wrap">
      <h1>Nightreign Buff Stacking</h1>
      <p className="sub">
        Every named special effect in Elden Ring Nightreign's <b>SpEffectParam</b> table (game
        version on disk, decoded 2026-09-17), with the engine field that decides stacking:{" "}
        <b>spCategory</b>. Effects sharing a non-zero category interact by that category's rule —
        the rules are on the right. Click a category number in the table to see everything a buff
        conflicts with.
      </p>

      <div className="layout">
        <FilterPanel filters={filters} counts={counts} onChange={updateFilters} />

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
          <p className="count">
            Showing {shown.length.toLocaleString()} of {filtered.length.toLocaleString()} effects
            ({ROWS.length.toLocaleString()} named total){wepNote}
          </p>
          <EffectsTable rows={shown} onPickCategory={pickCategory} boxRef={boxRef} />
          {shown.length < filtered.length && (
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
              effect lasts until removed by script or death.
            </p>
          </details>
        </main>

        <RulesPanel />
      </div>
    </div>
  );
}
