import { useEffect, useMemo, useRef, useState } from "react";

const fmt = (v) => "×" + v.toFixed(3);
const valClass = (v) => (v > 1.0001 ? "pv-up" : v < 0.9999 ? "pv-down" : "");

// Searchable picker for one relic line. options: [{ id, name, value, conflict,
// curse }]; options with a conflict are listed but can't be picked.
export default function EffectPicker({ value, options, onPick, placeholder, label }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [byValue, setByValue] = useState(true);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const listRef = useRef(null);
  const current = options.find((o) => o.id === value) || null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = options.filter((o) => !q || o.name.toLowerCase().includes(q));
    return list.sort(
      (a, b) =>
        (a.conflict ? 1 : 0) - (b.conflict ? 1 : 0) ||
        (byValue ? b.value - a.value : 0) ||
        a.name.localeCompare(b.name)
    );
  }, [options, query, byValue]);

  useEffect(() => { setActive(0); }, [query, byValue, open]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (o) => {
    if (o.conflict) return;
    onPick(o.id);
    setOpen(false);
    setQuery("");
  };
  const move = (dir) => {
    let i = active;
    for (let n = 0; n < shown.length; n++) {
      i = (i + dir + shown.length) % shown.length;
      if (!shown[i].conflict) { setActive(i); return; }
    }
  };

  return (
    <div className="picker" ref={boxRef}>
      <button
        type="button"
        className={"pickbtn" + (current ? "" : " empty")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(!open)}
      >
        <span className="pickname">{current ? current.name : placeholder}</span>
        {current && Math.abs(current.value - 1) > 1e-4 && (
          <span className={"pickval " + valClass(current.value)}>{fmt(current.value)}</span>
        )}
      </button>
      {open && (
        <div className="pickpop">
          <div className="pickbar">
            <input
              type="search"
              autoFocus
              placeholder="Search effects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
                else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
                else if (e.key === "Enter") { e.preventDefault(); if (shown[active]) pick(shown[active]); }
                else if (e.key === "Escape") setOpen(false);
              }}
              aria-label="Search effects"
            />
            <button type="button" className="chip" aria-pressed={byValue}
              onClick={() => setByValue(!byValue)} title="Sort by damage value">
              Damage first
            </button>
          </div>
          <ul className="picklist" role="listbox" ref={listRef} aria-label={label}>
            {value !== 0 && (
              <li role="option" aria-selected={false} className="pickopt clear"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick(0); setOpen(false); }}>
                Remove this effect
              </li>
            )}
            {shown.map((o, i) => (
              <li
                key={o.id}
                data-i={i}
                role="option"
                aria-selected={o.id === value}
                aria-disabled={!!o.conflict}
                className={"pickopt" + (i === active ? " active" : "") + (o.conflict ? " off" : "")}
                onMouseEnter={() => !o.conflict && setActive(i)}
                onClick={() => pick(o)}
              >
                <span className="oline">
                  <span>{o.name}</span>
                  {Math.abs(o.value - 1) > 1e-4 && (
                    <span className={"pickval " + valClass(o.value)}>{fmt(o.value)}</span>
                  )}
                </span>
                {o.curse && <span className="picktag">Deep-exclusive · rolls with a curse</span>}
                {o.conflict && <span className="pickwhy">{o.conflict}</span>}
              </li>
            ))}
            {shown.length === 0 && <li className="pickopt off">No matching effects</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
