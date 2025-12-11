// src/components/MixedResponseRenderer.jsx
import React from "react";
import AutoRenderer from "./AutoRenderer";

/* detect if a string contains a numbered list like "1. First\n2. Second" */
function stringLooksLikeNumberedList(s) {
  if (typeof s !== "string") return false;
  const lines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const numbered = lines.filter(l => /^[0-9]+\s*[\.\)]\s+/.test(l));
  return numbered.length >= Math.max(1, Math.floor(lines.length * 0.5));
}
function parseNumberedStringToArray(s) {
  const lines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];
  let buffer = null;
  for (const line of lines) {
    const m = line.match(/^([0-9]+)\s*[\.\)]\s+(.*)/);
    if (m) {
      if (buffer) items.push(buffer);
      buffer = m[2];
    } else {
      if (buffer !== null) buffer += " " + line;
      else items.push(line);
    }
  }
  if (buffer) items.push(buffer);
  return items;
}

export default function MixedResponseRenderer({ response, pathPrefix = "" }) {
  const blocks = [];
  if (Array.isArray(response)) {
    response.forEach((el, idx) => blocks.push({ key: `item-${idx}`, node: el }));
  } else if (response && typeof response === "object") {
    Object.keys(response).forEach((k, idx) => blocks.push({ key: k, node: response[k] }));
  } else {
    blocks.push({ key: "root", node: response });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {blocks.map((b, i) => {
        const node = b.node;
        if (typeof node === "string" && stringLooksLikeNumberedList(node)) {
          const arr = parseNumberedStringToArray(node);
          return (
            <div key={b.key}>
              <div style={{ fontSize: 12, color: "#9aa", marginBottom: 6 }}>
                <span style={{ background: "#222", padding: "4px 8px", borderRadius: 6, marginRight: 8 }}>{i+1}</span>
                Detected: ordered list (from text)
              </div>
              <AutoRenderer data={arr} path={`${pathPrefix}${b.key}`} />
            </div>
          );
        }
        return (
          <div key={b.key}>
            <div style={{ fontSize: 12, color: "#9aa", marginBottom: 6 }}>
              <span style={{ background: "#222", padding: "4px 8px", borderRadius: 6, marginRight: 8 }}>{i+1}</span>
              <AutoRenderer data={node} path={`${pathPrefix}${b.key}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
