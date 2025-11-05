import React, { useRef, useEffect } from "react";
import { FaArrowUp, FaStop } from "react-icons/fa";

export default function ChatInput({ prompt, setPrompt, handleSend, isStreaming = false }) {
  const taRef = useRef(null);

  useEffect(() => {
    adjustHeight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

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

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        backgroundColor: "#1e1e1e",
        borderRadius: 50,
        padding: "8px 12px",
        boxSizing: "border-box",
        width: "100%",
        boxShadow: "0 6px 22px rgba(0,0,0,0.35)",
      }}
    >
      <textarea
        ref={taRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={isStreaming ? "Bot is responding... (press Send to stop)" : "Type your message..."}
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
          padding: "8px 10px",
          minHeight: "20px",
          maxHeight: "200px",
          boxSizing: "border-box",
        }}
      />

      <button
        onClick={handleSend}
        title={isStreaming ? "Stop response" : "Send"}
        style={{
          marginLeft: 10,
          border: "none",
          borderRadius: "50%",
          width: 44,
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          background: isStreaming ? "#ff4d4f" : "linear-gradient(135deg,#0a84ff,#0066cc)",
          boxShadow: "0 6px 18px rgba(10,132,255,0.12)",
          flexShrink: 0,
        }}
      >
        {isStreaming ? <FaStop color="#fff" /> : <FaArrowUp color="#fff" />}
      </button>
    </div>
  );
}
