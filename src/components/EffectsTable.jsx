import { useState } from "react";
import { VERDICTS, SOURCES, WEP_NAME, durText } from "../model.js";

export function WepCell({ weps }) {
  if (weps === "*") return <span className="wtag any">any weapon</span>;
  if (!weps.length) return <span className="num-plain">—</span>;
  const vis = weps.slice(0, 3);
  return (
    <>
      {vis.map((w) => (
        <span key={w} className="wtag">{WEP_NAME[w] || "Type " + w}</span>
      ))}
      {weps.length > 3 && <span className="wtag any">+{weps.length - 3}</span>}
    </>
  );
}

function uniq(vals) {
  return [...new Set(vals)];
}

function CatCell({ cat, onPickCategory }) {
  return cat === 0
    ? <span className="num-plain">0</span>
    : <button className="catbtn" type="button" onClick={() => onPickCategory(cat)}>{cat}</button>;
}

function EffectRow({ r, onPickCategory, variant }) {
  const vd = VERDICTS[r.v];
  return (
    <tr className={variant ? "variant" : undefined}>
      <td className="name">
        {r.name}
        {r.mod && <span className={r.mod.startsWith("scripted") ? "mod scripted" : "mod"}>{r.mod}</span>}
        {r.via && <span className="via">from: {r.via}</span>}
      </td>
      <td className={vd.cls}><span className="pill">{vd.label}</span></td>
      <td>{r.srcs.map((s) => <span key={s} className="stag">{SOURCES[s] || s}</span>)}</td>
      <td><WepCell weps={r.weps} /></td>
      <td><CatCell cat={r.cat} onPickCategory={onPickCategory} /></td>
      <td className="num">{r.prio}</td>
      <td className="num">{durText(r.dur)}</td>
    </tr>
  );
}

function GroupRow({ g, onPickCategory, open, onToggle }) {
  const verdicts = uniq(g.members.map((r) => r.v));
  const cats = uniq(g.members.map((r) => r.cat));
  const prios = uniq(g.members.map((r) => r.prio));
  const durs = uniq(g.members.map((r) => r.dur));
  const srcs = uniq(g.members.flatMap((r) => r.srcs));
  const anyWep = g.members.some((r) => r.weps === "*");
  const wepIds = uniq(g.members.flatMap((r) => (r.weps === "*" ? [] : r.weps)));
  const vd = verdicts.length === 1 ? VERDICTS[verdicts[0]] : null;
  return (
    <>
      <tr className="grouprow">
        <td className="name">
          <button
            type="button"
            className="gtoggle"
            aria-expanded={open}
            onClick={onToggle}
          >
            <span aria-hidden="true">{open ? "▾" : "▸"}</span> {g.name}
            <span className="gcount">{g.members.length} variants</span>
          </button>
        </td>
        <td className={vd ? vd.cls : undefined}>
          {vd ? <span className="pill">{vd.label}</span> : <span className="num-plain">varies</span>}
        </td>
        <td>{srcs.map((s) => <span key={s} className="stag">{SOURCES[s] || s}</span>)}</td>
        <td>{anyWep && !wepIds.length ? <WepCell weps="*" /> : <WepCell weps={wepIds} />}</td>
        <td>
          {cats.length === 1
            ? <CatCell cat={cats[0]} onPickCategory={onPickCategory} />
            : <span className="num-plain">varies</span>}
        </td>
        <td className="num">{prios.length === 1 ? prios[0] : "…"}</td>
        <td className="num">{durs.length === 1 ? durText(durs[0]) : "…"}</td>
      </tr>
      {open && g.members.map((r) => (
        <EffectRow key={r.id} r={r} onPickCategory={onPickCategory} variant />
      ))}
    </>
  );
}

export default function EffectsTable({ groups, onPickCategory, boxRef }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  return (
    <div className="tablebox" ref={boxRef}>
      <table>
        <thead>
          <tr>
            <th>Effect</th><th>Stacking</th><th>Source</th>
            <th>Weapons</th><th>Cat</th><th>Prio</th><th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) =>
            g.members.length === 1
              ? <EffectRow key={g.members[0].id} r={g.members[0]} onPickCategory={onPickCategory} />
              : <GroupRow key={g.key} g={g} onPickCategory={onPickCategory}
                  open={open.has(g.key)} onToggle={() => toggle(g.key)} />
          )}
        </tbody>
      </table>
    </div>
  );
}
