// src/components/AutoRenderer.jsx
import React, { useMemo, useState } from "react";

/* ---------- small shape helpers ---------- */
const isPlainObject = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const isArrayOfStrings = (a) => Array.isArray(a) && a.every(v => typeof v === "string");
const isArrayOfPrimitives = (a) => Array.isArray(a) && a.every(v => v === null || ["string","number","boolean"].includes(typeof v));
const isArrayOfObjects = (a) => Array.isArray(a) && a.length > 0 && a.every(v => isPlainObject(v));
const isArrayOfArrays = (a) => Array.isArray(a) && a.length > 0 && a.every(v => Array.isArray(v));
const uniformLength = (arr) => isArrayOfArrays(arr) && arr.every(r => r.length === arr[0].length);
const sharedKeysRatio = (arr) => {
  if (!isArrayOfObjects(arr)) return 0;
  const all = Array.from(new Set(arr.flatMap(o => Object.keys(o))));
  const common = arr.reduce((acc, o) => acc.filter(k => Object.keys(o).includes(k)), Object.keys(arr[0]));
  return common.length / Math.max(1, all.length);
};

/* ---------- scoring (heuristics) ---------- */
function scoreCandidates(node) {
  if (typeof node === "string") return [{ type: "string", score: 1 }];
  if (typeof node === "number" || typeof node === "boolean" || node === null) return [{ type: "string", score: 0.9 }];

  if (Array.isArray(node)) {
    if (node.length === 0) return [{ type: "list", score: 0.5 }];
    if (isArrayOfStrings(node)) return [{ type: "bullet_list", score: 0.95 }, { type: "indexed_list", score: 0.7 }];
    if (isArrayOfPrimitives(node)) return [{ type: "indexed_list", score: 0.85 }];
    if (isArrayOfObjects(node)) {
      const sk = sharedKeysRatio(node);
      return [{ type: "table", score: 0.6 + 0.4 * sk, meta: { sharedKeysRatio: sk } }];
    }
    if (isArrayOfArrays(node)) {
      const uniform = uniformLength(node);
      const innerLen = node[0].length;
      const firstColAllStrings = node.every(r => typeof r[0] === "string");
      if (innerLen === 2 && firstColAllStrings) {
        return [{ type: "key_value_rows", score: uniform ? 0.9 : 0.7 }];
      }
      return [{ type: "table_rows", score: uniform ? 0.9 : 0.6, meta: { uniformLength: uniform, innerLen } }];
    }
    return [{ type: "list", score: 0.5 }];
  }

  if (isPlainObject(node)) {
    // domain-specific hint: comparative block
    if (node.name && node.traits_comparison) {
      return [{ type: "comparative_block", score: 0.95 }];
    }
    const vals = Object.values(node);
    const allArrays = vals.length > 0 && vals.every(v => Array.isArray(v));
    if (allArrays) {
      const lens = vals.map(v => v.length);
      const sameLen = lens.every(l => l === lens[0]);
      if (sameLen && lens[0] > 0) return [{ type: "columns_table", score: 0.82 }];
    }
    const simpleKV = vals.every(v => ["string","number","boolean"].includes(typeof v) || v === null);
    if (simpleKV) return [{ type: "kv_list", score: 0.85 }];
    return [{ type: "object", score: 0.6 }];
  }

  return [{ type: "unknown", score: 0.2 }];
}

/* ---------- small renderers ---------- */

const th = { border: "1px solid #ddd", padding: 8, background: "#14141a", color: "#cfd8ff", textAlign: "left" };
const td = { border: "1px solid #222", padding: 8, verticalAlign: "top", color: "#ddd" };

function RenderString({ value }) {
  return <div style={{ whiteSpace: "pre-wrap", color: "#e6e6e6" }}>{String(value)}</div>;
}
function RenderBulletList({ arr }) {
  return <ul>{arr.map((s,i) => <li key={i}>{s}</li>)}</ul>;
}
function RenderIndexedList({ arr }) {
  return <ol>{arr.map((s,i) => <li key={i}>{String(s)}</li>)}</ol>;
}
function RenderKVList({ obj }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <tbody>
        {Object.entries(obj).map(([k,v]) => (
          <tr key={k}>
            <td style={{ ...td, width: "30%", fontWeight: 600 }}>{k}</td>
            <td style={td}><AutoRenderer data={v} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function RenderTableFromObjects({ arr }) {
  const columns = Array.from(new Set(arr.flatMap(o => Object.keys(o))));
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr><th style={th}>#</th>{columns.map(c => <th key={c} style={th}>{c}</th>)}</tr></thead>
      <tbody>
        {arr.map((r, idx) => (
          <tr key={idx}>
            <td style={td}>{idx + 1}</td>
            {columns.map(col => <td key={col} style={td}><AutoRenderer data={r[col]} /></td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function RenderTableFromRows({ rows }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <tbody>
        {rows.map((r,i) => (
          <tr key={i}>{r.map((c,j) => <td key={j} style={td}>{String(c)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
function RenderComparison({ block }) {
  const names = block.name || [];
  const [a1, a2] = names;
  return (
    <div>
      <h3 style={{ color: "#cfe" }}>Comparison: {a1} vs {a2}</h3>
      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ flex: 1 }}>
          <h4>{a1}</h4>
          {Array.isArray(block.description?.[a1]) && <RenderBulletList arr={block.description[a1]} />}
        </div>
        <div style={{ flex: 1 }}>
          <h4>{a2}</h4>
          {Array.isArray(block.description?.[a2]) && <RenderBulletList arr={block.description[a2]} />}
        </div>
      </div>

      <h4 style={{ marginTop: 12 }}>Traits</h4>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr><th style={th}>Trait</th><th style={th}>{a1}</th><th style={th}>{a2}</th></tr>
        </thead>
        <tbody>
          {Object.entries(block.traits_comparison || {}).map(([trait, rows]) => {
            const left = (rows.find(r => r[0] === a1) || ["", ""])[1] || "";
            const right = (rows.find(r => r[0] === a2) || ["", ""])[1] || "";
            return (
              <tr key={trait}>
                <td style={td}><strong>{trait.replace(/_/g," ")}</strong></td>
                <td style={td}>{left}</td>
                <td style={td}>{right}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- AutoRenderer component ---------- */

export default function AutoRenderer({ data, path = "" }) {
  const [altView, setAltView] = useState(null);
  const candidates = useMemo(() => scoreCandidates(data), [data]);
  const top = candidates.reduce((a,b) => a.score >= b.score ? a : b, { type: "unknown", score: 0 });
  const topScore = top.score;
  const showAlternatives = topScore < 0.75 || (candidates.length > 1 && candidates.some(c => Math.abs(c.score - topScore) < 0.12));
  const rendererType = altView || top.type;

  const renderBody = () => {
    switch (rendererType) {
      case "string": return <RenderString value={data} />;
      case "bullet_list": return <RenderBulletList arr={data} />;
      case "indexed_list": return <RenderIndexedList arr={data} />;
      case "kv_list": return <RenderKVList obj={data} />;
      case "table": return <RenderTableFromObjects arr={data} />;
      case "table_rows": return <RenderTableFromRows rows={data} />;
      case "columns_table": return <RenderTableFromObjects arr={transposeColumnsToObjects(data)} />;
      case "comparative_block": return <RenderComparison block={data} />;
      case "raw": return <pre style={{ whiteSpace: "pre-wrap", color: "#ddd" }}>{JSON.stringify(data, null, 2)}</pre>;
      case "object": return <RenderKVList obj={data} />;
      default: return <pre style={{ whiteSpace: "pre-wrap", color: "#ddd" }}>{JSON.stringify(data, null, 2)}</pre>;
    }
  };

  return (
    <div style={{ marginBottom: 12, padding: 8, borderRadius: 8, border: "1px solid #222", background: "#0f0f12" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: "#9aa" }}>{path || "block"}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, background: topScore > 0.8 ? "#083" : topScore > 0.6 ? "#b58" : "#822", color: "#fff" }}>
            {rendererType} • {Math.round(topScore * 100)}%
          </div>
          {showAlternatives && (
            <select value={altView || ""} onChange={e => setAltView(e.target.value || null)}>
              <option value="">Auto</option>
              {candidates.map(c => <option key={c.type} value={c.type}>{c.type} ({Math.round(c.score*100)}%)</option>)}
              <option value="raw">Raw JSON</option>
            </select>
          )}
        </div>
      </div>

      <div>{renderBody()}</div>
    </div>
  );
}

/* helper to transpose columns-of-arrays -> array-of-objects */
function transposeColumnsToObjects(obj) {
  const cols = Object.keys(obj || {});
  if (cols.length === 0) return [];
  const len = obj[cols[0]].length;
  const out = [];
  for (let i = 0; i < len; i++) {
    const row = {};
    for (const c of cols) row[c] = obj[c][i];
    out.push(row);
  }
  return out;
}
