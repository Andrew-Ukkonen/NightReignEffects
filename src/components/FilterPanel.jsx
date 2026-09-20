import { useState } from "react";
import Checklist from "./Checklist.jsx";
import { VERDICTS, SOURCES, WEP_TYPES, TYPES } from "../model.js";

export default function FilterPanel({ filters, counts, onChange, collapsible }) {
  const { query, verdicts, weps, srcs, types } = filters;
  const [open, setOpen] = useState(false);
  const nActive = verdicts.size + weps.size + srcs.size + types.size;

  const toggle = (set, key) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  };

  return (
    <aside className="side filtercol" aria-label="Filters">
      <div className="panel">
        <p className="ptitle">Search</p>
        <input
          type="search"
          placeholder="Effect, weapon, or relic…"
          aria-label="Search effects"
          value={query}
          onChange={(e) => onChange({ query: e.target.value })}
        />
      </div>

      {collapsible && (
        <button
          className="ftoggle"
          type="button"
          aria-expanded={open}
          aria-controls="filter-groups"
          onClick={() => setOpen(!open)}
        >
          Filters{nActive > 0 && <span className="n"> · {nActive} active</span>}
          <span aria-hidden="true">{open ? "▴" : "▾"}</span>
        </button>
      )}

      <div id="filter-groups" hidden={collapsible && !open}>
      <div className="panel">
        <p className="ptitle">
          Weapon type
          {weps.size > 0 && (
            <button className="pclear" type="button" onClick={() => onChange({ weps: new Set() })}>
              clear
            </button>
          )}
        </p>
        <Checklist
          label="Filter by weapon type"
          items={WEP_TYPES.map(([k, name]) => ({ key: k, label: name }))}
          selected={weps}
          counts={counts.weps}
          onToggle={(k) => onChange({ weps: toggle(weps, k) })}
        />
      </div>

      <div className="panel">
        <p className="ptitle">
          Effect type
          {types.size > 0 && (
            <button className="pclear" type="button" onClick={() => onChange({ types: new Set() })}>
              clear
            </button>
          )}
        </p>
        <Checklist
          short
          label="Filter by effect type"
          items={Object.entries(TYPES).map(([k, name]) => ({ key: k, label: name }))}
          selected={types}
          counts={counts.types}
          onToggle={(k) => onChange({ types: toggle(types, k) })}
        />
      </div>

      <div className="panel">
        <p className="ptitle">
          Source
          {srcs.size > 0 && (
            <button className="pclear" type="button" onClick={() => onChange({ srcs: new Set() })}>
              clear
            </button>
          )}
        </p>
        <Checklist
          short
          label="Filter by source"
          items={Object.entries(SOURCES).map(([k, name]) => ({ key: k, label: name }))}
          selected={srcs}
          counts={counts.srcs}
          onToggle={(k) => onChange({ srcs: toggle(srcs, k) })}
        />
      </div>

      <div className="panel">
        <p className="ptitle">Stacking rule</p>
        <div className="chips" role="group" aria-label="Filter by stacking rule">
          {Object.entries(VERDICTS).map(([k, v]) => {
            const on = verdicts.has(k);
            const n = counts.verdicts[k] || 0;
            return (
              <button
                key={k}
                type="button"
                className={"chip " + v.cls + (!n ? " zero" : "")}
                aria-pressed={on}
                onClick={() => onChange({ verdicts: toggle(verdicts, k) })}
              >
                <span className="dot"></span>
                {v.label} · {n}
              </button>
            );
          })}
        </div>
      </div>
      </div>
    </aside>
  );
}
