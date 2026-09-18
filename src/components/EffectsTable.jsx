import { VERDICTS, SOURCES, WEP_NAME, durText } from "../model.js";

function WepCell({ weps }) {
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

export default function EffectsTable({ rows, onPickCategory, boxRef }) {
  return (
    <div className="tablebox" ref={boxRef}>
      <table>
        <thead>
          <tr>
            <th>ID</th><th>Effect</th><th>Stacking</th><th>Source</th>
            <th>Weapons</th><th>Cat</th><th>Prio</th><th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const vd = VERDICTS[r.v];
            return (
              <tr key={r.id}>
                <td className="num">{r.id}</td>
                <td className="name">
                  {r.name}
                  {r.mod && <span className="mod">{r.mod}</span>}
                  {r.via && <span className="via">from: {r.via}</span>}
                </td>
                <td className={vd.cls}><span className="pill">{vd.label}</span></td>
                <td>{r.srcs.map((s) => <span key={s} className="stag">{SOURCES[s] || s}</span>)}</td>
                <td><WepCell weps={r.weps} /></td>
                <td>
                  {r.cat === 0
                    ? <span className="num-plain">0</span>
                    : <button className="catbtn" type="button" onClick={() => onPickCategory(r.cat)}>{r.cat}</button>}
                </td>
                <td className="num">{r.prio}</td>
                <td className="num">{durText(r.dur)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
