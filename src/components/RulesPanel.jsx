const RULES = [
  { cls: "v-self",    var: "--v-self",    title: "Stacks with itself — cat 10",
    text: "Multiple copies of the effect coexist. Repeated procs, DoTs, and per-hit bonuses live here." },
  { cls: "v-free",    var: "--v-free",    title: "No group — cat 0",
    text: "No category interaction. Different effects coexist freely; the same effect ID reapplied simply runs as a new instance." },
  { cls: "v-refresh", var: "--v-refresh", title: "Refreshes — cat 20",
    text: "Reapplying resets the timer. Never accumulates. Most debuffs and slows work this way." },
  { cls: "v-excl",    var: "--v-excl",    title: "Group-exclusive — cat 100–299",
    text: "New effect removes the previous one in the same category. Body buffs, weapon greases (one per hand), pickled feet each share a group. Cat 200 only removes a previous effect of matching priority." },
  { cls: "v-highest", var: "--v-high",    title: "Highest priority wins — cat 1000s",
    text: "All instances are tracked but only the highest categoryPriority applies." },
  { cls: "v-first",   var: "--v-first",   title: "First applied wins — cat 10000s",
    text: "Later applications are ignored while one is active. Status-buildup effects (poison, bleed, frost…) per source." },
];

export default function RulesPanel() {
  return (
    <aside className="side rulecol" aria-label="Stacking rules">
      <p className="rulehead">How stacking works</p>
      <div className="rules">
        {RULES.map((r) => (
          <div key={r.cls} className={"rule " + r.cls} style={{ "--rc": `var(${r.var})` }}>
            <h3>{r.title}</h3>
            <p>{r.text}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
