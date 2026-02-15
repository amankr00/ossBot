import React, { useRef, useEffect, useState } from "react";
import { FaArrowUp, FaStop } from "react-icons/fa";

export default function ChatInput({
  prompt,
  setPrompt,
  svNo,
  setSvNo,
  handleSend,
  isStreaming = false,
  isMobile = false,
}) {
  const taRef = useRef(null);
  const [phSize, setPhSize] = useState(16);

  // Adjust height dynamically based on content
  useEffect(() => {
    adjustHeight();
  }, [prompt]);

  // Responsive placeholder text resizing
  useEffect(() => {
    const updatePlaceholderSize = () => {
      const ta = taRef.current;
      if (!ta) return;
      const width = ta.clientWidth;
      const threshold = 520; // start shrinking below this width
      const maxFont = 16;
      const minFont = 12;

      if (width >= threshold) setPhSize(maxFont);
      else {
        const scaled = (width / threshold) * maxFont;
        setPhSize(Math.max(minFont, Math.round(scaled)));
      }
    };

    updatePlaceholderSize();

    let ro;
    if (window.ResizeObserver && taRef.current) {
      ro = new ResizeObserver(updatePlaceholderSize);
      ro.observe(taRef.current);
    } else {
      window.addEventListener("resize", updatePlaceholderSize);
    }

    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", updatePlaceholderSize);
    };
  }, []);

  // Handle textarea height adjustment
  const adjustHeight = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const computed = window.getComputedStyle(ta);
    const lineHeight = parseFloat(computed.lineHeight) || 20;
    const paddingTop = parseFloat(computed.paddingTop) || 0;
    const paddingBottom = parseFloat(computed.paddingBottom) || 0;
    const maxRows = 10;
    const maxHeight = lineHeight * maxRows + paddingTop + paddingBottom;

    const newHeight = Math.min(ta.scrollHeight, maxHeight);
    ta.style.height = `${newHeight}px`;
    ta.style.overflowY = ta.scrollHeight > maxHeight ? "auto" : "hidden";
  };

  const canSend = isStreaming || (prompt.trim().length > 0 && String(svNo).trim().length > 0);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!canSend) return;
      handleSend();
    }
  };

  const placeholderText = isStreaming
    ? "press red button to stop"
    : "Describe the your startup idea...";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        backgroundColor: "#1e1e1e",
        borderRadius: isMobile ? 22 : 50,
        padding: isMobile ? "6px 8px" : "8px 12px",
        boxSizing: "border-box",
        width: "100%",
        boxShadow: "0 6px 22px rgba(0,0,0,0.35)",
      }}
    >
      {/* Placeholder styling (responsive + single-line) */}
      <style>{`
        .chat-ta::placeholder {
          font-size: ${phSize}px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          opacity: 0.85;
        }
      `}</style>

      <textarea
        ref={taRef}
        className="chat-ta"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={placeholderText}
        onKeyDown={onKeyDown}
        rows={1}
        style={{
          flex: 1,
          display: "block",
          background: "transparent",
          border: "none",
          color: "white",
          outline: "none",
          resize: "none",
          fontSize: 16,
          fontFamily: "sans-serif",
          lineHeight: "20px",
          padding: isMobile ? "8px 8px" : "8px 10px",
          minHeight: "20px",
          maxHeight: "200px",
          boxSizing: "border-box",
          overflowX: "hidden", // 🚫 disables horizontal scroll
          overflowWrap: "break-word", // breaks long words instead of scrolling
          wordBreak: "break-word",
        }}
      />

      <input
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        value={svNo}
        onChange={(e) => setSvNo(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="SV No."
        style={{
          width: isMobile ? 88 : 112,
          marginLeft: isMobile ? 6 : 8,
          background: "#2a2a2a",
          border: "1px solid #40404f",
          color: "#fff",
          borderRadius: 12,
          outline: "none",
          fontSize: isMobile ? 13 : 14,
          padding: isMobile ? "10px 8px" : "11px 10px",
          boxSizing: "border-box",
        }}
      />

      {/* Send / Stop button */}
      <button
        onClick={handleSend}
        disabled={!canSend}
        title={isStreaming ? "Stop" : "Send"}
        style={{
          marginLeft: isMobile ? 6 : 8,
          width: isMobile ? 40 : 44,
          height: isMobile ? 40 : 44,
          borderRadius: isMobile ? 20 : 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          background: isStreaming ? "#ff4d4d" : canSend ? "#0a84ff" : "#586174",
          color: "#fff",
          cursor: canSend ? "pointer" : "not-allowed",
          opacity: canSend ? 1 : 0.8,
          flexShrink: 0,
        }}
      >
        {isStreaming ? <FaStop /> : <FaArrowUp />}
      </button>
    </div>
  );
}
