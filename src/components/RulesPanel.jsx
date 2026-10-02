const RULES = [
  { cls: "v-self",    var: "--v-self",    title: "Stacks with itself — cat 10",
    text: "Multiple copies of the effect coexist. Repeated procs, DoTs, and per-hit bonuses live here." },
  { cls: "v-free",    var: "--v-free",    title: "No group — cat 0",
    text: "No category interaction. Different effects coexist freely; the same effect ID reapplied simply runs as a new instance." },
  { cls: "v-refresh", var: "--v-refresh", title: "Refreshes — cat 20",
    text: "Reapplying resets the timer. Never accumulates. Most debuffs and slows work this way." },
  { cls: "v-excl",    var: "--v-excl",    title: "Group-exclusive — cat 100–299",
    text: "New effect removes the previous one in the same category. Body buffs and weapon greases (one per hand) share a group. In cats 200–299 each priority value is its own slot: only an effect of matching priority is removed, so the pickled feet (cat 202, priorities 212–214) coexist." },
  { cls: "v-highest", var: "--v-high",    title: "Highest priority wins — cat 1000s",
    text: "All instances are tracked but only the highest categoryPriority applies." },
  { cls: "v-first",   var: "--v-first",   title: "First applied wins — cat 10000s",
    text: "Later applications are ignored while one is active. Status-buildup effects (poison, bleed, frost…) per source." },
  { cls: "v-tier",    var: "--v-tier",    title: "One tier at a time — counter ladders",
    text: "The buff is a ladder of tiers sharing one exclusive slot (×1.05, ×1.05², …). Each trigger — an evergaol cleared, a great enemy defeated — moves up one tier. Extra copies of the relic add nothing: the trigger fires once, not once per copy." },
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
