import React, { useState, useRef, useEffect } from "react";
import ChatInput from "./components/ChatInput";

const uid = (prefix = "") => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;

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

  const messagesContainerRef = useRef(null); // used to find message elements visually
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const programmaticScrollRef = useRef(false);

  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
      if (fetchControllerRef.current) {
        try {
          fetchControllerRef.current.abort();
        } catch {}
        fetchControllerRef.current = null;
      }
      if (liveTimerIntervalRef.current) {
        clearInterval(liveTimerIntervalRef.current);
        liveTimerIntervalRef.current = null;
      }
    };
  }, []);

  const pushMessage = (m) => setMessages((prev) => [...prev, m]);

  // ---------- scrolling helpers (document-level scrolling) ----------
  const scrollTo = (top, smooth = true) => {
    programmaticScrollRef.current = true;
    try {
      window.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
    } catch {
      window.scrollTo(0, top);
    }
    // small delay to avoid treating this as a user action
    setTimeout(() => (programmaticScrollRef.current = false), 600);
  };

  const scrollToBottom = (smooth = true) => {
    const target = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    scrollTo(target, smooth);
  };

  // Scroll a particular element so that its bottom is visible just above the fixed input area.
  function scrollElementJustAboveInput(el, inputReservePx = 140, smooth = true) {
    if (!el) {
      scrollToBottom(smooth);
      return;
    }
    const rect = el.getBoundingClientRect();
    // distance from top of viewport to element bottom
    const elementBottomViewport = rect.bottom;
    // the y (in viewport coords) we want the element bottom to be at:
    // window.innerHeight - inputReservePx (so it's just above input)
    const desiredBottomViewport = window.innerHeight - inputReservePx;
    const delta = elementBottomViewport - desiredBottomViewport;
    if (Math.abs(delta) < 1) return; // already in good place

    const targetY = Math.max(0, window.scrollY + delta);
    scrollTo(targetY, smooth);
  }

  // Ensure a message is visible (wrapper that uses the above)
  const ensureMessageVisibleIfNeeded = (msgId, thresholdPx = 40) => {
    if (!autoScrollEnabled) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-msgid="${msgId}"]`);
    if (!el) return;
    // Reserve space for the input area + some margin (adjust if your ChatInput height differs)
    const reserve = 140;
    scrollElementJustAboveInput(el, reserve, true);
  };

  // ---------- detect user scroll (document) ----------
  useEffect(() => {
    const onUserAction = () => {
      if (programmaticScrollRef.current) return;
      setAutoScrollEnabled(false);
    };

    const onScroll = () => {
      if (programmaticScrollRef.current) return;
      const distanceFromBottom =
        document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
      setAutoScrollEnabled(distanceFromBottom < 50);
    };

    window.addEventListener("wheel", onUserAction, { passive: true });
    window.addEventListener("touchstart", onUserAction, { passive: true });
    window.addEventListener("pointerdown", onUserAction, { passive: true });
    window.addEventListener("mousedown", onUserAction, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("wheel", onUserAction);
      window.removeEventListener("touchstart", onUserAction);
      window.removeEventListener("pointerdown", onUserAction);
      window.removeEventListener("mousedown", onUserAction);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // ---------- improved autoscroll behavior ----------
  // Only auto-scroll to bottom if last message is a bot message (and not streaming).
  // If the last message is a user message, scroll just enough to show that user message
  // above the input (so the user can immediately see what they posted).
  useEffect(() => {
    if (!autoScrollEnabled || messages.length === 0) return;

    const last = messages[messages.length - 1];
    if (!last) return;

    // let layout settle first (images/fonts/DOM)
    setTimeout(() => {
      if (last.sender === "user") {
        // scroll so user's message is visible above the input, not snapped to absolute bottom
        ensureMessageVisibleIfNeeded(last.id, 140);
      } else {
        // last sender is bot
        if (!isStreaming) {
          scrollToBottom(true);
        } else {
          // if streaming, keep last bot element visible while streaming
          ensureMessageVisibleIfNeeded(last.id, 140);
        }
      }
    }, 40);
  }, [messages.length, isStreaming, autoScrollEnabled]);

  const formatMsToMinSec = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(mins)} mins ${pad(secs)} secs`;
  };

  // ---------- sending logic (preserved) ----------
  const handleSend = async () => {
    if (isStreaming) {
      stopStreamingAndReveal();
      return;
    }

    const trimmed = prompt.trim();
    if (!trimmed) return;

    // push user message first
    pushMessage({ id: uid("u_"), sender: "user", text: trimmed, status: "done" });

    setPrompt("");
    setShowTitle(false);

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

    setTimeout(() => {
      // When message(s) added, the useEffect above will decide how to scroll.
      // We still call ensureMessageVisibleIfNeeded for the bot entry so it doesn't hide.
      if (autoScrollEnabled) {
        // prefer to make the newly-added user message visible
        const lastUser = messagesContainerRef.current?.querySelector(`[data-msgid^="u_"]:last-of-type`);
        if (lastUser) scrollElementJustAboveInput(lastUser, 140, true);
        else scrollToBottom(true);
      } else {
        // respect user scroll; still ensure bot is visible a bit if possible
        ensureMessageVisibleIfNeeded(botId, 140);
      }
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
      if (autoScrollEnabled) ensureMessageVisibleIfNeeded(botId, 140);
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
              responseTimeMs:
                m.responseTimeMs != null ? m.responseTimeMs : m.startTime != null ? Math.max(0, now - m.startTime) : 0,
            }
          : m
      )
    );

    setIsStreaming(false);
    activeBotIdRef.current = null;
    if (autoScrollEnabled) setTimeout(() => scrollToBottom(true), 50);
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
    if (autoScrollEnabled) setTimeout(() => scrollToBottom(true), 80);
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
    if (autoScrollEnabled) setTimeout(() => scrollToBottom(true), 80);
  }

  // ---------- render ----------
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

              {/* 🕒 Timer (always visible bottom-left) */}
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

  // layout: central panel (full viewport height visually) + bottom fixed input.
  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0f", paddingBottom: 140 }}>
      <div style={{ width: "70vw", marginLeft: "15vw", marginRight: "15vw", paddingTop: 28 }}>
        <div
          ref={messagesContainerRef}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            width: "100%",
            height: "100vh",
            overflow: "visible",
            paddingRight: 8,
          }}
        >
          {renderMessages()}
        </div>

        {showTitle && (
          <h2
            style={{
              position: "fixed",
              bottom: 300,
              left: "15vw",
              width: "70vw",
              textAlign: "center",
              color: "#ccc",
              margin: 0,
              fontFamily: "sans-serif",
              letterSpacing: 1,
            }}
          >
            NSBOT IS HERE TO ASSIST YOU
          </h2>
        )}
      </div>

      <div
        className="fixed-chat"
        style={{
          position: "fixed",
          bottom: 30,
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
