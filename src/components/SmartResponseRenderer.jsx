import React, { useMemo } from "react";

const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isPrimitive = (v) => v == null || ["string", "number", "boolean"].includes(typeof v);

const container = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  color: "#e6e6e6",
};

const baseTable = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  tableLayout: "fixed",
};

const thStyle = {
  border: "1px solid #2d2d3f",
  background: "#171724",
  color: "#dbe5ff",
  padding: "8px 10px",
  textAlign: "left",
  verticalAlign: "top",
  fontWeight: 600,
};

const tdStyle = {
  border: "1px solid #2d2d3f",
  padding: "8px 10px",
  verticalAlign: "top",
  overflowWrap: "anywhere",
};

function tryParseJsonString(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const variants = normalizeTextVariants(trimmed);
  for (const candidate of variants) {
    const parsed = tryJsonParseCandidate(candidate);
    if (parsed !== null) return parsed;
  }

  return tryParseQuotedObjectBlocks(variants);
}

function normalizeTextVariants(text) {
  const variants = [];

  const push = (value) => {
    const v = typeof value === "string" ? value.trim() : "";
    if (!v) return;
    if (!variants.includes(v)) variants.push(v);
  };

  const withNormalizedQuotes = text
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\u00a0/g, " ");

  push(withNormalizedQuotes);

  const withoutCodeFence = withNormalizedQuotes.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, "$1").trim();
  push(withoutCodeFence);

  const htmlStripped = stripHtmlNoise(withoutCodeFence);
  push(htmlStripped);

  const htmlDecoded = decodeHtmlEntities(htmlStripped);
  push(htmlDecoded);

  return variants;
}

function stripHtmlNoise(text) {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function tryJsonParseCandidate(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (err) {
    void err;
  }

  const repaired = text
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/^\uFEFF/, "");
  if (repaired !== text) {
    try {
      return JSON.parse(repaired);
    } catch (err) {
      void err;
    }
  }

  const extracted = extractFirstBalancedJson(text);
  if (extracted) {
    try {
      return JSON.parse(extracted);
    } catch (err) {
      void err;
    }

    const repairedExtracted = extracted.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(repairedExtracted);
    } catch (err) {
      void err;
    }
  }

  return null;
}

function extractFirstBalancedJson(text) {
  let start = -1;
  let openChar = "";
  let closeChar = "";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (start === -1) {
      if (ch === "{" || ch === "[") {
        start = i;
        openChar = ch;
        closeChar = ch === "{" ? "}" : "]";
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === openChar) {
      depth += 1;
    } else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function tryParseQuotedObjectBlocks(variants) {
  for (const raw of variants) {
    const text = raw.trim();
    if (!text) continue;

    const blocks = [];
    let idx = 0;

    while (idx < text.length) {
      const keyMatch = text.slice(idx).match(/"([^"]+)"\s*:\s*\{/);
      if (!keyMatch) break;

      const keyOffset = idx + keyMatch.index;
      const key = keyMatch[1];
      const braceStart = keyOffset + keyMatch[0].lastIndexOf("{");
      const objPart = extractBalancedObjectFrom(text, braceStart);
      if (!objPart) {
        idx = keyOffset + keyMatch[0].length;
        continue;
      }

      const parsed = tryJsonParseCandidate(objPart);
      if (parsed && isPlainObject(parsed)) {
        blocks.push([key, parsed]);
      }

      idx = braceStart + objPart.length;
    }

    if (blocks.length >= 2) {
      return Object.fromEntries(blocks);
    }
  }

  return null;
}

function extractBalancedObjectFrom(text, startIndex) {
  if (text[startIndex] !== "{") return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;

    if (depth === 0) {
      return text.slice(startIndex, i + 1);
    }
  }

  return null;
}

function parsePointwiseText(text) {
  if (typeof text !== "string") return null;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return null;

  const numbered = lines.every((l) => /^\d+\s*[.)]\s+/.test(l));
  if (numbered) {
    return {
      ordered: true,
      items: lines.map((l) => l.replace(/^\d+\s*[.)]\s+/, "").trim()),
    };
  }

  const bulleted = lines.every((l) => /^[-*•]\s+/.test(l));
  if (bulleted) {
    return {
      ordered: false,
      items: lines.map((l) => l.replace(/^[-*•]\s+/, "").trim()),
    };
  }

  return null;
}

function parseMarkdownTable(text) {
  if (typeof text !== "string") return null;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return null;
  if (!lines.every((l) => l.includes("|"))) return null;

  const splitRow = (row) =>
    row
      .split("|")
      .map((c) => c.trim())
      .filter((_, i, arr) => !(i === 0 && arr[0] === "") && !(i === arr.length - 1 && arr[arr.length - 1] === ""));

  const header = splitRow(lines[0]);
  const sep = splitRow(lines[1]);
  const sepValid =
    sep.length === header.length &&
    sep.every((c) => /^:?-{3,}:?$/.test(c));
  if (!sepValid) return null;

  const rows = lines.slice(2).map(splitRow).filter((r) => r.length === header.length);
  if (rows.length === 0) return null;

  return { header, rows };
}

function isArrayOfObjects(arr) {
  return Array.isArray(arr) && arr.length > 0 && arr.every((x) => isPlainObject(x));
}

function isArrayOfPrimitives(arr) {
  return Array.isArray(arr) && arr.every(isPrimitive);
}

function isRectangularArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  if (!arr.every((r) => Array.isArray(r))) return false;
  const len = arr[0].length;
  return len > 0 && arr.every((r) => r.length === len);
}

function objectOfEqualLengthArrays(obj) {
  if (!isPlainObject(obj)) return null;
  const entries = Object.entries(obj);
  if (entries.length === 0) return null;
  if (!entries.every(([, v]) => Array.isArray(v))) return null;

  const size = entries[0][1].length;
  if (!entries.every(([, v]) => v.length === size)) return null;
  if (size === 0) return null;

  const rows = Array.from({ length: size }, (_, idx) => {
    const row = {};
    for (const [k, v] of entries) row[k] = v[idx];
    return row;
  });
  return rows;
}

function comparisonShape(obj) {
  if (!isPlainObject(obj)) return null;
  const entities = Object.entries(obj);
  if (entities.length < 2) return null;
  if (!entities.every(([, value]) => isPlainObject(value))) return null;

  const keySets = entities.map(([, value]) => Object.keys(value));
  const shared = keySets.reduce((acc, keys) => acc.filter((k) => keys.includes(k)), keySets[0]);
  if (shared.length === 0) return null;

  const union = Array.from(new Set(keySets.flat()));
  const sharedRatio = shared.length / Math.max(1, union.length);
  if (sharedRatio < 0.5) return null;

  return {
    columns: entities.map(([name]) => name),
    rowKeys: union,
    map: Object.fromEntries(entities),
  };
}

function renderHumanLabel(label) {
  return label
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function RenderTable({ columns, rows, depth }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={baseTable}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} style={thStyle}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((c) => (
                <td key={`${idx}-${c}`} style={tdStyle}>
                  <RenderNode value={row[c]} depth={depth + 1} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderPlainText(text) {
  return (
    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55, overflowWrap: "anywhere" }}>
      {text}
    </div>
  );
}

function RenderNode({ value, depth = 0 }) {
  if (depth > 8) {
    return (
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", overflowX: "auto" }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  if (value == null) return <span style={{ opacity: 0.8 }}>null</span>;
  if (typeof value === "number" || typeof value === "boolean") return <span>{String(value)}</span>;

  if (typeof value === "string") {
    const parsedJson = tryParseJsonString(value);
    if (parsedJson !== null) {
      return <RenderNode value={parsedJson} depth={depth + 1} />;
    }

    const mdTable = parseMarkdownTable(value);
    if (mdTable) {
      const rows = mdTable.rows.map((r) => {
        const obj = {};
        mdTable.header.forEach((h, i) => {
          obj[h] = r[i];
        });
        return obj;
      });
      return <RenderTable columns={mdTable.header} rows={rows} depth={depth + 1} />;
    }

    const pointwise = parsePointwiseText(value);
    if (pointwise) {
      const ListTag = pointwise.ordered ? "ol" : "ul";
      return (
        <ListTag style={{ margin: "4px 0 4px 20px", padding: 0, lineHeight: 1.5 }}>
          {pointwise.items.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ListTag>
      );
    }

    return renderPlainText(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>[]</span>;

    if (isArrayOfObjects(value)) {
      const columns = Array.from(new Set(value.flatMap((obj) => Object.keys(obj))));
      return <RenderTable columns={columns} rows={value} depth={depth + 1} />;
    }

    if (isRectangularArray(value)) {
      const firstRowLooksHeader = value[0].every((c) => typeof c === "string");
      if (firstRowLooksHeader && value.length > 1) {
        const header = value[0].map((c) => String(c));
        const rows = value.slice(1).map((row) => {
          const obj = {};
          header.forEach((h, idx) => {
            obj[h] = row[idx];
          });
          return obj;
        });
        return <RenderTable columns={header} rows={rows} depth={depth + 1} />;
      }

      const columns = value[0].map((_, i) => `Col ${i + 1}`);
      const rows = value.map((row) => {
        const obj = {};
        columns.forEach((c, idx) => {
          obj[c] = row[idx];
        });
        return obj;
      });
      return <RenderTable columns={columns} rows={rows} depth={depth + 1} />;
    }

    if (isArrayOfPrimitives(value)) {
      const pointwiseLike = value.every((v) => typeof v === "string" && /^(\d+\s*[.)]\s+|[-*•]\s+)/.test(v));
      const ordered = pointwiseLike && value.every((v) => typeof v === "string" && /^\d+\s*[.)]\s+/.test(v));
      const ListTag = ordered ? "ol" : "ul";
      return (
        <ListTag style={{ margin: "4px 0 4px 20px", padding: 0, lineHeight: 1.5 }}>
          {value.map((item, idx) => (
            <li key={idx}>
              {typeof item === "string" ? item.replace(/^(\d+\s*[.)]\s+|[-*•]\s+)/, "") : String(item)}
            </li>
          ))}
        </ListTag>
      );
    }

    return (
      <ol style={{ margin: "4px 0 4px 20px", padding: 0, lineHeight: 1.5 }}>
        {value.map((item, idx) => (
          <li key={idx}>
            <RenderNode value={item} depth={depth + 1} />
          </li>
        ))}
      </ol>
    );
  }

  if (isPlainObject(value)) {
    const asComparison = comparisonShape(value);
    if (asComparison) {
      return (
        <div style={{ overflowX: "auto" }}>
          <table style={baseTable}>
            <thead>
              <tr>
                <th style={thStyle}>Aspect</th>
                {asComparison.columns.map((col) => (
                  <th key={col} style={thStyle}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {asComparison.rowKeys.map((rowKey) => (
                <tr key={rowKey}>
                  <td style={{ ...thStyle, width: "26%" }}>{renderHumanLabel(rowKey)}</td>
                  {asComparison.columns.map((col) => (
                    <td key={`${rowKey}-${col}`} style={tdStyle}>
                      <RenderNode value={asComparison.map[col]?.[rowKey]} depth={depth + 1} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    const asRows = objectOfEqualLengthArrays(value);
    if (asRows) {
      const columns = Object.keys(value);
      return <RenderTable columns={columns} rows={asRows} depth={depth + 1} />;
    }

    const entries = Object.entries(value);
    const allPrimitive = entries.every(([, v]) => isPrimitive(v));
    if (allPrimitive) {
      return (
        <table style={baseTable}>
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k}>
                <td style={{ ...thStyle, width: "34%" }}>{k}</td>
                <td style={tdStyle}>
                  <RenderNode value={v} depth={depth + 1} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ border: "1px solid #2d2d3f", borderRadius: 8, overflow: "hidden" }}>
            <div
              style={{
                background: "#171724",
                color: "#dbe5ff",
                padding: "7px 10px",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.2,
              }}
            >
              {k}
            </div>
            <div style={{ padding: 10 }}>
              <RenderNode value={v} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <pre style={{ margin: 0, whiteSpace: "pre-wrap", overflowX: "auto" }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function SmartResponseRenderer({ data, rawText }) {
  const normalized = useMemo(() => {
    if (data !== undefined && data !== null) return data;
    if (typeof rawText === "string") {
      const parsed = tryParseJsonString(rawText);
      return parsed ?? rawText;
    }
    return rawText ?? null;
  }, [data, rawText]);

  return (
    <div style={container}>
      <RenderNode value={normalized} />
    </div>
  );
}
