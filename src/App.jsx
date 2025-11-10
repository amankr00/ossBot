import React, { useState, useRef, useEffect } from "react";
import ChatInput from "./components/ChatInput";

const uid = (prefix = "") => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;

// layout constants — keep them in sync with your CSS for the input wrapper
const CHAT_INPUT_BOTTOM = 30; // matches `bottom: 30px` on the fixed input wrapper
const GAP_ABOVE_INPUT = 20; // the 20px gap you want between chat panel and input
const TOP_PADDING = 28;

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTitle, setShowTitle] = useState(true);

  const typingIntervalRef = useRef(null);
  const activeBotIdRef = useRef(null);
  const fetchControllerRef = useRef(null);
  const liveTimerIntervalRef = useRef(null);
  const [tick, setTick] = useState(0);

  const panelRef = useRef(null); // fixed panel (visual column)
  const scrollContainerRef = useRef(null); // inner scrolling container for messages
  const chatInputWrapperRef = useRef(null); // fixed chat input wrapper (measured)
  const [chatInputHeight, setChatInputHeight] = useState(0);

  // autoscroll control
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const programmaticScrollRef = useRef(false);

  // enforce consistent background
  useEffect(() => {
    const bg = "#0d0d0f";
    try {
      document.documentElement.style.background = bg;
      document.body.style.background = bg;
    } catch {}
  }, []);

  // measure chat input wrapper height to compute panel bottom
  useEffect(() => {
    const measure = () => {
      const el = chatInputWrapperRef.current;
      if (!el) return;
      const h = Math.ceil(el.getBoundingClientRect().height);
      setChatInputHeight(h);
    };

    measure();
    let ro;
    if (window.ResizeObserver && chatInputWrapperRef.current) {
      ro = new ResizeObserver(measure);
      ro.observe(chatInputWrapperRef.current);
    } else {
      window.addEventListener("resize", measure);
    }
    return () => {
      if (ro) {
        try {
          ro.disconnect();
        } catch {}
      } else {
        window.removeEventListener("resize", measure);
      }
    };
  }, []);

  // cleanup intervals/fetch controller on unmount
  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
      if (liveTimerIntervalRef.current) {
        clearInterval(liveTimerIntervalRef.current);
        liveTimerIntervalRef.current = null;
      }
      if (fetchControllerRef.current) {
        try {
          fetchControllerRef.current.abort();
        } catch {}
        fetchControllerRef.current = null;
      }
    };
  }, []);

  const pushMessage = (m) => setMessages((prev) => [...prev, m]);

  // ---------- inner scroll helpers ----------
  const scrollInnerToBottom = (smooth = true) => {
    const c = scrollContainerRef.current;
    if (!c) return;
    programmaticScrollRef.current = true;
    try {
      c.scrollTo({ top: c.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    } catch {
      c.scrollTop = c.scrollHeight;
    }
    // short timeout to avoid treating this programmatic scroll as user scroll
    setTimeout(() => (programmaticScrollRef.current = false), 200);
  };

  // ensure an element is visible in the inner scroll container with a bottom gap
  const ensureInnerElementVisible = (el, gap = GAP_ABOVE_INPUT) => {
    const c = scrollContainerRef.current;
    if (!c || !el) return;
    const elTop = el.offsetTop;
    const elBottom = elTop + el.offsetHeight;
    const viewTop = c.scrollTop;
    const viewHeight = c.clientHeight;
    const viewBottom = viewTop + viewHeight;

    // We want the element bottom to sit at least `gap` px above the panel's bottom visual area.
    // Inside the container, just ensure elementBottom <= viewBottom - gapInternal.
    const gapInternal = Math.max(12, gap); // small padding
    if (elBottom > viewBottom - gapInternal) {
      const target = elBottom - viewHeight + gapInternal;
      programmaticScrollRef.current = true;
      try {
        c.scrollTo({ top: target, behavior: "smooth" });
      } catch {
        c.scrollTop = target;
      }
      setTimeout(() => (programmaticScrollRef.current = false), 200);
    } else if (elTop < viewTop) {
      const target = Math.max(0, elTop - 12);
      programmaticScrollRef.current = true;
      try {
        c.scrollTo({ top: target, behavior: "smooth" });
      } catch {
        c.scrollTop = target;
      }
      setTimeout(() => (programmaticScrollRef.current = false), 200);
    }
  };

  // detect user scroll in the inner container to disable auto-scroll
  useEffect(() => {
    const c = scrollContainerRef.current;
    if (!c) return;
    const onUserScroll = () => {
      if (programmaticScrollRef.current) return;
      setAutoScrollEnabled(false);
    };
    c.addEventListener("wheel", onUserScroll, { passive: true });
    c.addEventListener("touchstart", onUserScroll, { passive: true });
    c.addEventListener("pointerdown", onUserScroll, { passive: true });
    c.addEventListener("mousedown", onUserScroll, { passive: true });

    return () => {
      c.removeEventListener("wheel", onUserScroll);
      c.removeEventListener("touchstart", onUserScroll);
      c.removeEventListener("pointerdown", onUserScroll);
      c.removeEventListener("mousedown", onUserScroll);
    };
  }, [scrollContainerRef.current]);

  // when messages change, auto-scroll the inner container only if enabled
  useEffect(() => {
    const c = scrollContainerRef.current;
    if (!c) return;
    if (!autoScrollEnabled) return;

    setTimeout(() => {
      const last = messages[messages.length - 1];
      if (!last) return;
      if (last.sender === "user") {
        const el = c.querySelector(`[data-msgid="${last.id}"]`);
        if (el) ensureInnerElementVisible(el);
        else scrollInnerToBottom(true);
      } else {
        // bot
        if (!isStreaming) scrollInnerToBottom(true);
        else {
          const el = c.querySelector(`[data-msgid="${last.id}"]`);
          if (el) ensureInnerElementVisible(el);
          else scrollInnerToBottom(true);
        }
      }
    }, 40);
  }, [messages.length, isStreaming, autoScrollEnabled, chatInputHeight]);

  const formatMsToMinSec = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(mins)} mins ${pad(secs)} secs`;
  };

  // ---------- sending logic (kept intact) ----------
  const handleSend = async () => {
    if (isStreaming) {
      stopStreamingAndReveal();
      return;
    }
    const trimmed = prompt.trim();
    if (!trimmed) return;

    // add user message
    const userId = uid("u_");
    pushMessage({ id: userId, sender: "user", text: trimmed, status: "done" });
    setPrompt("");
    setShowTitle(false);

    // prepare bot message placeholder
    const botId = uid("b_");
    activeBotIdRef.current = botId;
    const start = Date.now();

    if (liveTimerIntervalRef.current) {
      clearInterval(liveTimerIntervalRef.current);
      liveTimerIntervalRef.current = null;
    }
    liveTimerIntervalRef.current = setInterval(() => setTick(Date.now()), 500);

    pushMessage({
      id: botId,
      sender: "bot",
      thinkingText: "",
      responseText: "",
      thinkingFull: null,
      responseFull: null,
      status: "waiting",
      startTime: start,
      responseTimeMs: null,
    });

    // ensure newly-added user message is visible in inner container
    setTimeout(() => {
      const c = scrollContainerRef.current;
      if (!c) return;
      const el = c.querySelector(`[data-msgid="${userId}"]`);
      if (el && autoScrollEnabled) ensureInnerElementVisible(el);
      else if (autoScrollEnabled) scrollInnerToBottom(true);
    }, 40);

    setIsStreaming(true);

    if (fetchControllerRef.current) {
      try {
        fetchControllerRef.current.abort();
      } catch {}
      fetchControllerRef.current = null;
    }
    fetchControllerRef.current = new AbortController();
    const signal = fetchControllerRef.current.signal;

    try {
      const resp = await fetch("https://llmoss.duckdns.org/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ givePrompt: trimmed }),
        signal,
      });

      const data = await resp.json();
      const thinkingText = (data.thinking ?? "").toString();
      const responseText = (data.response ?? "").toString();
      const hasThinking = Boolean(thinkingText && thinkingText.trim());
      const hasResponse = Boolean(responseText && responseText.trim());
      const responseTimeMs = Date.now() - start;

      if (liveTimerIntervalRef.current) {
        clearInterval(liveTimerIntervalRef.current);
        liveTimerIntervalRef.current = null;
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === botId
            ? {
                ...m,
                responseTimeMs,
                thinkingFull: hasThinking ? thinkingText : null,
                responseFull: hasResponse ? responseText : responseText || "No response",
                thinkingText: "",
                responseText: "",
                status: hasThinking ? "streaming-thinking" : "streaming-response",
              }
            : m
        )
      );

      if (!activeBotIdRef.current || activeBotIdRef.current !== botId) {
        setIsStreaming(false);
        return;
      }

      if (hasThinking) {
        startTypingReveal(botId, thinkingText, "thinking", () => {
          if (hasResponse && activeBotIdRef.current === botId) {
            setMessages((prev) =>
              prev.map((m) => (m.id === botId ? { ...m, status: "streaming-response", responseText: "" } : m))
            );
            startTypingReveal(botId, responseText, "response", () => finalizeBotDone(botId));
          } else {
            finalizeBotDone(botId);
          }
        });
      } else {
        startTypingReveal(botId, responseText || "No response", "response", () => finalizeBotDone(botId));
      }
    } catch (err) {
      if (liveTimerIntervalRef.current) {
        clearInterval(liveTimerIntervalRef.current);
        liveTimerIntervalRef.current = null;
      }
      if (err && err.name === "AbortError") {
        finalizeActiveBotAsDone();
        return;
      }
      console.error("Fetch error:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botId ? { ...m, responseText: "Error: failed to fetch response.", status: "done", responseTimeMs: m.startTime ? Date.now() - m.startTime : 0 } : m
        )
      );
      setIsStreaming(false);
      activeBotIdRef.current = null;
      if (fetchControllerRef.current) fetchControllerRef.current = null;
    } finally {
      if (fetchControllerRef.current && !fetchControllerRef.current.signal.aborted) {
        fetchControllerRef.current = null;
      }
    }
  };

  function startTypingReveal(botId, fullText, phase, onComplete) {
    let i = 0;
    const speed = 22;
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }

    typingIntervalRef.current = setInterval(() => {
      i++;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botId
            ? phase === "thinking"
              ? { ...m, thinkingText: fullText.slice(0, i), status: "streaming-thinking" }
              : { ...m, responseText: fullText.slice(0, i), status: "streaming-response" }
            : m
        )
      );
      if (autoScrollEnabled) {
        // keep the bot message visible inside the inner container
        const c = scrollContainerRef.current;
        const el = c ? c.querySelector(`[data-msgid="${botId}"]`) : null;
        if (el) ensureInnerElementVisible(el);
      }
      if (i >= fullText.length) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
        if (onComplete) onComplete();
      }
    }, speed);
  }

  function stopStreamingAndReveal() {
    const botId = activeBotIdRef.current;
    if (fetchControllerRef.current) {
      try {
        fetchControllerRef.current.abort();
      } catch {}
      fetchControllerRef.current = null;
    }
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    if (liveTimerIntervalRef.current) {
      clearInterval(liveTimerIntervalRef.current);
      liveTimerIntervalRef.current = null;
    }
    if (!botId) {
      setIsStreaming(false);
      return;
    }

    const now = Date.now();
    setMessages((prev) =>
      prev.map((m) =>
        m.id === botId
          ? {
              ...m,
              status: "done",
              responseTimeMs: m.responseTimeMs != null ? m.responseTimeMs : m.startTime != null ? Math.max(0, now - m.startTime) : 0,
            }
          : m
      )
    );

    setIsStreaming(false);
    activeBotIdRef.current = null;
    if (autoScrollEnabled) scrollInnerToBottom(true);
  }

  function finalizeBotDone(botId) {
    const now = Date.now();
    setMessages((prev) =>
      prev.map((m) =>
        m.id === botId
          ? {
              ...m,
              status: "done",
              responseTimeMs: m.responseTimeMs != null ? m.responseTimeMs : m.startTime != null ? Math.max(0, now - m.startTime) : 0,
            }
          : m
      )
    );

    if (liveTimerIntervalRef.current) {
      clearInterval(liveTimerIntervalRef.current);
      liveTimerIntervalRef.current = null;
    }

    setIsStreaming(false);
    activeBotIdRef.current = null;
    if (autoScrollEnabled) scrollInnerToBottom(true);
  }

  function finalizeActiveBotAsDone() {
    const botId = activeBotIdRef.current;
    if (!botId) {
      setIsStreaming(false);
      return;
    }
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    if (liveTimerIntervalRef.current) {
      clearInterval(liveTimerIntervalRef.current);
      liveTimerIntervalRef.current = null;
    }
    const now = Date.now();
    setMessages((prev) =>
      prev.map((m) =>
        m.id === botId
          ? {
              ...m,
              status: "done",
              responseTimeMs: m.responseTimeMs != null ? m.responseTimeMs : m.startTime != null ? Math.max(0, now - m.startTime) : 0,
            }
          : m
      )
    );
    setIsStreaming(false);
    activeBotIdRef.current = null;
    if (autoScrollEnabled) scrollInnerToBottom(true);
  }

  // ---------- render messages ----------
  const renderMessages = () =>
    messages.map((m) => {
      const isUser = m.sender === "user";
      const elapsedMs =
        m.responseTimeMs != null
          ? m.responseTimeMs
          : m.startTime != null
          ? Math.max(0, Date.now() - m.startTime)
          : 0;

      return (
        <div
          key={m.id}
          data-msgid={m.id}
          style={{
            display: "flex",
            width: "100%",
            justifyContent: isUser ? "flex-end" : "flex-start",
            marginBottom: 10,
          }}
        >
          {!isUser ? (
            <div
              style={{
                maxWidth: "80%",
                padding: "16px 16px 40px 16px",
                borderRadius: 16,
                background: "#1e1e2f",
                color: "#ddd",
                whiteSpace: "pre-wrap",
                boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                position: "relative",
                boxSizing: "border-box",
              }}
            >
              {(m.status === "waiting" || m.thinkingText) && (
                <div style={{ marginBottom: 8, color: "#9fb7ff" }}>
                  <div style={{ fontSize: 12, color: "#7ea0ff", marginBottom: 6 }}>Thinking:</div>
                  <div>{m.status === "waiting" && !m.thinkingText ? "Thinking..." : m.thinkingText}</div>
                </div>
              )}

              {m.status === "streaming-response" || m.status === "done" ? (
                <div>
                  <div style={{ fontSize: 12, color: "#6ef08a", marginBottom: 6 }}>Response:</div>
                  <div>{m.responseText}</div>
                </div>
              ) : null}

              <div
                style={{
                  position: "absolute",
                  left: 14,
                  bottom: 10,
                  fontSize: 12,
                  color: "#aaa",
                  whiteSpace: "nowrap",
                  letterSpacing: "0.5px",
                  background: "rgba(0,0,0,0.25)",
                  padding: "2px 6px",
                  borderRadius: 8,
                  backdropFilter: "blur(2px)",
                  lineHeight: 1.2,
                }}
              >
                ⏱ {formatMsToMinSec(elapsedMs)}
              </div>
            </div>
          ) : (
            <div
              style={{
                maxWidth: "78%",
                padding: "12px 14px",
                borderRadius: 14,
                background: "linear-gradient(135deg,#0a84ff,#0066cc)",
                color: "#fff",
                whiteSpace: "pre-wrap",
                boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
              }}
            >
              {m.text}
            </div>
          )}
        </div>
      );
    });

  // compute the fixed panel bottom in px: equals input height + bottom offset + gap
  const panelBottom = chatInputHeight + CHAT_INPUT_BOTTOM + GAP_ABOVE_INPUT;

  // inner container paddingBottom so last element never underlaps input
  const innerPaddingBottom = chatInputHeight + GAP_ABOVE_INPUT + 12;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0f", color: "#ddd" }}>
      {/* fixed central panel positioned between top padding and panelBottom above input */}
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          top: TOP_PADDING,
          left: "15vw",
          width: "70vw",
          bottom: panelBottom,
          overflow: "hidden", // inner scroll container handles scroll
          display: "flex",
          flexDirection: "column",
          paddingRight: 8,
          boxSizing: "border-box",
        }}
      >
        {/* inner scrollable container */}
        <div
          ref={scrollContainerRef}
          style={{
            overflowY: "auto",
            paddingBottom: innerPaddingBottom,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minHeight: 0,
          }}
        >
          {renderMessages()}

          {/* Title shown centered when no messages and showTitle true */}
          {messages.length === 0 && showTitle && (
            <h2
              style={{
                textAlign: "center",
                color: "#ccc",
                marginTop: "30vh",
                fontFamily: "sans-serif",
                letterSpacing: 1,
              }}
            >
              NSBOT IS HERE TO ASSIST YOU
            </h2>
          )}
        </div>
      </div>

      {/* fixed chat input wrapper (measured) */}
      <div
        ref={chatInputWrapperRef}
        style={{
          position: "fixed",
          bottom: CHAT_INPUT_BOTTOM,
          left: "15vw",
          width: "70vw",
          zIndex: 9999,
        }}
      >
        <ChatInput prompt={prompt} setPrompt={setPrompt} handleSend={handleSend} isStreaming={isStreaming} />
      </div>
    </div>
  );
}
