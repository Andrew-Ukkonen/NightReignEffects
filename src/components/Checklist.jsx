export default function Checklist({ items, selected, counts, onToggle, short = false, label }) {
  return (
    <div className={"checklist" + (short ? " short" : "")} role="group" aria-label={label}>
      {items.map((it) => {
        const checked = selected.has(it.key);
        const n = counts[it.key] || 0;
        return (
          <label key={String(it.key)} className={!n && !checked ? "zero" : undefined}>
            <input type="checkbox" checked={checked} onChange={() => onToggle(it.key)} />
            {it.label}
            <span className="n">{n}</span>
          </label>
        );
      })}
    </div>
  );
}
