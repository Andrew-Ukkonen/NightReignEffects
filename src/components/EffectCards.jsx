import { VERDICTS, SOURCES, durText } from "../model.js";
import { WepCell } from "./EffectsTable.jsx";

function Card({ r, onPickCategory }) {
  const vd = VERDICTS[r.v];
  return (
    <article className="card">
      <div className="card-top">
        <span className={vd.cls}><span className="pill">{vd.label}</span></span>
        <span className="num-plain card-dur">{durText(r.dur)}</span>
      </div>
      <h3 className="card-name">
        {r.name}
        {r.mod && <span className={r.mod.startsWith("scripted") ? "mod scripted" : "mod"}>{r.mod}</span>}
      </h3>
      {r.via && <span className="via">from: {r.via}</span>}
      <div className="card-tags">
        {r.srcs.map((s) => <span key={s} className="stag">{SOURCES[s] || s}</span>)}
        <WepCell weps={r.weps} />
      </div>
      <div className="card-meta">
        <span>
          Category:{" "}
          {r.cat === 0
            ? "0"
            : <button className="catbtn" type="button" onClick={() => onPickCategory(r.cat)}>{r.cat}</button>}
        </span>
        <span>Priority: {r.prio}</span>
      </div>
    </article>
  );
}

export default function EffectCards({ groups, onPickCategory }) {
  return (
    <div className="cards">
      {groups.map((g) =>
        g.members.length === 1 ? (
          <Card key={g.members[0].id} r={g.members[0]} onPickCategory={onPickCategory} />
        ) : (
          <details key={g.key} className="cardgroup">
            <summary>
              {g.name} <span className="gcount">{g.members.length} variants</span>
            </summary>
            {g.members.map((r) => (
              <Card key={r.id} r={r} onPickCategory={onPickCategory} />
            ))}
          </details>
        )
      )}
    </div>
  );
}
