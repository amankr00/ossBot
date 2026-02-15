// src/App.jsx
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import ChatInput from "./components/ChatInput";
import SmartResponseRenderer from "./components/SmartResponseRenderer";
import ThinkingIndicator from "./components/ThinkingIndicator";
import nsAppsLogo from "./assets/nsAppsLogo.svg";

const uid = (prefix = "") => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;

const toDisplayText = (payload) => {
  if (payload == null) return "{}";
  if (typeof payload === "string") return payload;
  if (typeof payload === "number" || typeof payload === "boolean") return String(payload);
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
};

const extractRenderablePayload = (backendData) => {
  if (backendData && Object.prototype.hasOwnProperty.call(backendData, "response")) {
    return backendData.response;
  }
  return backendData;
};

// layout constants — keep them in sync with your CSS for the input wrapper
const CHAT_INPUT_BOTTOM = 30; // matches `bottom: 30px` on the fixed input wrapper
const GAP_ABOVE_INPUT = 20; // the 20px gap you want between chat panel and input
const TOP_PADDING = 28;

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [svNo, setSvNo] = useState("");
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTitle, setShowTitle] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1200 : window.innerWidth
  );

  // streaming / timers / control refs (kept from your original)
  const typingIntervalRef = useRef(null);
  const activeBotIdRef = useRef(null);
  const fetchControllerRef = useRef(null);
  const liveTimerIntervalRef = useRef(null);
  const [, setTick] = useState(0);

  // layout / scroll refs
  const panelRef = useRef(null);
  const scrollContainerRef = useRef(null); // inner scrolling container
  const endOfMessagesRef = useRef(null);
  const chatInputWrapperRef = useRef(null); // measured wrapper for input
  const [chatInputHeight, setChatInputHeight] = useState(0);

  // autoscroll control
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const autoScrollEnabledRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const scrollFrameRef = useRef(null);
  const userInterruptedAutoscrollRef = useRef(false);

  // force consistent background
  useEffect(() => {
    const bg = "#0d0d0f";
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
  }, []);

  // viewport width for responsive layout
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // measure input wrapper height (ResizeObserver)
  useEffect(() => {
    const measure = () => {
      const el = chatInputWrapperRef.current;
      if (!el) return;
      const h = Math.ceil(el.getBoundingClientRect().height);
      setChatInputHeight(h);
    };
    measure(); // initial
    let ro;
    try {
      if (window.ResizeObserver && chatInputWrapperRef.current) {
        ro = new ResizeObserver(measure);
        ro.observe(chatInputWrapperRef.current);
      } else {
        window.addEventListener("resize", measure);
      }
    } catch {
      window.addEventListener("resize", measure);
    }
    return () => {
      if (ro) {
        ro.disconnect();
      } else {
        window.removeEventListener("resize", measure);
      }
    };
  }, []);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
      if (liveTimerIntervalRef.current) clearInterval(liveTimerIntervalRef.current);
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
      }
      if (scrollFrameRef.current) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  const pushMessage = (m) => setMessages((prev) => [...prev, m]);

  const isMobile = viewportWidth <= 768;
  const isTablet = viewportWidth > 768 && viewportWidth <= 1100;

  const inputBottom = isMobile ? 10 : CHAT_INPUT_BOTTOM;
  const gapAboveInput = isMobile ? 12 : GAP_ABOVE_INPUT;
  const topPadding = isMobile ? 10 : TOP_PADDING;

  const panelLeft = isMobile ? "3vw" : isTablet ? "6vw" : "15vw";
  const panelWidth = isMobile ? "94vw" : isTablet ? "88vw" : "70vw";
  const panelRightPadding = isMobile ? 0 : 8;

  const botBubbleMaxWidth = isMobile ? "93%" : isTablet ? "86%" : "80%";
  const userBubbleMaxWidth = isMobile ? "90%" : isTablet ? "84%" : "78%";

  // ---------- scrolling helpers ----------
  const applyAutoScrollState = useCallback((enabled) => {
    autoScrollEnabledRef.current = enabled;
    setAutoScrollEnabled(enabled);
  }, []);

  const scrollInnerToBottom = useCallback((force = false) => {
    const c = scrollContainerRef.current;
    if (!c) return;
    if (!force && !autoScrollEnabledRef.current) return;

    programmaticScrollRef.current = true;
    const end = endOfMessagesRef.current;
    if (end) {
      end.scrollIntoView({ block: "end", inline: "nearest", behavior: "auto" });
    } else {
      c.scrollTop = c.scrollHeight;
    }

    if (scrollFrameRef.current) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
      scrollFrameRef.current = null;
    });
  }, []);

  const jumpToLatest = useCallback(() => {
    userInterruptedAutoscrollRef.current = false;
    applyAutoScrollState(true);
    scrollInnerToBottom(true);
  }, [applyAutoScrollState, scrollInnerToBottom]);

  // Stop auto-scroll only when the user interacts with the stream while typing.
  useEffect(() => {
    const c = scrollContainerRef.current;
    if (!c) return;

    const stopAutoscrollOnInteract = () => {
      if (programmaticScrollRef.current) return;
      if (!isStreaming) return;
      userInterruptedAutoscrollRef.current = true;
      applyAutoScrollState(false);
    };

    const onScroll = () => {
      if (programmaticScrollRef.current) return;
      if (!isStreaming) return;
      const distanceFromBottom = c.scrollHeight - (c.scrollTop + c.clientHeight);
      if (distanceFromBottom > 4) {
        stopAutoscrollOnInteract();
      }
    };

    c.addEventListener("scroll", onScroll, { passive: true });
    c.addEventListener("wheel", stopAutoscrollOnInteract, { passive: true });
    c.addEventListener("touchstart", stopAutoscrollOnInteract, { passive: true });
    c.addEventListener("pointerdown", stopAutoscrollOnInteract, { passive: true });
    c.addEventListener("mousedown", stopAutoscrollOnInteract, { passive: true });

    return () => {
      c.removeEventListener("scroll", onScroll);
      c.removeEventListener("wheel", stopAutoscrollOnInteract);
      c.removeEventListener("touchstart", stopAutoscrollOnInteract);
      c.removeEventListener("pointerdown", stopAutoscrollOnInteract);
      c.removeEventListener("mousedown", stopAutoscrollOnInteract);
    };
  }, [applyAutoScrollState, isStreaming]);

  // Keep viewport pinned while rendering until user interrupts.
  useLayoutEffect(() => {
    if (!autoScrollEnabledRef.current) return;
    scrollInnerToBottom(true);
  }, [messages, isStreaming, chatInputHeight, autoScrollEnabled, scrollInnerToBottom]);

  const formatMsCompact = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(mins)}:${pad(secs)}`;
  };

  // ---------- send / streaming logic ----------
  const handleSend = async () => {
    if (isStreaming) {
      stopStreamingAndReveal();
      return;
    }

    const trimmed = prompt.trim();
    const trimmedSvNo = String(svNo).trim();
    if (!trimmed || !trimmedSvNo) return;

    userInterruptedAutoscrollRef.current = false;
    applyAutoScrollState(true);
    const userId = uid("u_");
    pushMessage({ id: userId, sender: "user", text: `SV No: ${trimmedSvNo}\n${trimmed}`, status: "done" });
    setPrompt("");
    setSvNo("");
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
      responseText: "",
      responseFull: null,
      responsePayload: null,
      status: "waiting",
      startTime: start,
      responseTimeMs: null,
    });

    setIsStreaming(true);

    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort();
      fetchControllerRef.current = null;
    }
    fetchControllerRef.current = new AbortController();
    const signal = fetchControllerRef.current.signal;

    try {
      const resp = await fetch("https://nsbot.online/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ givePrompt: trimmed, svNo: trimmedSvNo }),
        signal,
      });

      const data = await resp.json();
      const responsePayload = extractRenderablePayload(data);
      const responseText = toDisplayText(responsePayload);
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
                responseFull: responseText || "{}",
                responsePayload: responsePayload,
                responseText: "",
                status: "streaming-response",
              }
            : m
        )
      );

      if (!activeBotIdRef.current || activeBotIdRef.current !== botId) {
        setIsStreaming(false);
        return;
      }

      startTypingReveal(botId, responseText || "{}", () => finalizeBotDone(botId));
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
          m.id === botId
            ? {
                ...m,
                responseText: "Error: failed to fetch response.",
                responsePayload: "Error: failed to fetch response.",
                status: "done",
                responseTimeMs: m.startTime ? Date.now() - m.startTime : 0,
              }
            : m
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

  // Typing reveal updates message content only; viewport pinning is handled centrally by layout effects.
  function startTypingReveal(botId, fullText, onComplete) {
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
            ? { ...m, responseText: fullText.slice(0, i), status: "streaming-response" }
            : m
        )
      );

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
      fetchControllerRef.current.abort();
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
    if (autoScrollEnabledRef.current) scrollInnerToBottom(true);
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
    if (autoScrollEnabledRef.current) scrollInnerToBottom(true);
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
    if (autoScrollEnabledRef.current) scrollInnerToBottom(true);
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
                maxWidth: botBubbleMaxWidth,
                padding: isMobile ? "12px 12px 36px 12px" : "16px 16px 40px 16px",
                borderRadius: isMobile ? 14 : 16,
                background: "#1e1e2f",
                color: "#ddd",
                whiteSpace: "pre-wrap",
                boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                position: "relative",
                boxSizing: "border-box",
              }}
            >
              {m.status === "waiting" ? (
                <ThinkingIndicator elapsedLabel={formatMsCompact(elapsedMs)} isMobile={isMobile} />
              ) : m.status === "done" ? (
                <SmartResponseRenderer data={m.responsePayload} rawText={m.responseFull || m.responseText || ""} />
              ) : (
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    color: "#e6e6e6",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: isMobile ? 12 : 13,
                    lineHeight: 1.45,
                    overflowX: "auto",
                  }}
                >
                  {m.responseText || m.responseFull || ""}
                </pre>
              )}

            </div>
          ) : (
            <div
              style={{
                maxWidth: userBubbleMaxWidth,
                padding: isMobile ? "10px 12px" : "12px 14px",
                borderRadius: isMobile ? 12 : 14,
                background: "linear-gradient(135deg,#0a84ff,#0066cc)",
                color: "#fff",
                whiteSpace: "pre-wrap",
                boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                fontSize: isMobile ? 14 : 15,
              }}
            >
              {m.text}
            </div>
          )}
        </div>
      );
    });

  // compute the fixed panel bottom in px: equals input height + bottom offset + gap
  const panelBottom = chatInputHeight + inputBottom + gapAboveInput;

  // inner container paddingBottom so last element never underlaps input
  const innerPaddingBottom = chatInputHeight + gapAboveInput + (isMobile ? 18 : 12);
  const showJumpToLatest = !autoScrollEnabled && messages.length > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0f", color: "#ddd" }}>
      {/* fixed central panel positioned between top padding and panelBottom above input */}
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          top: `calc(${topPadding}px + env(safe-area-inset-top))`,
          left: panelLeft,
          width: panelWidth,
          bottom: `calc(${panelBottom}px + env(safe-area-inset-bottom))`,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          paddingRight: panelRightPadding,
          boxSizing: "border-box",
        }}
      >
        {/* inner scrollable container */}
        <div
          ref={scrollContainerRef}
          style={{
            overflowY: "auto",
            paddingBottom: `calc(${innerPaddingBottom}px + env(safe-area-inset-bottom))`,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minHeight: 0,
            overscrollBehaviorY: "contain",
            overflowAnchor: "none",
            paddingLeft: isMobile ? 2 : 0,
            paddingRight: isMobile ? 2 : 0,
          }}
        >
          {renderMessages()}

          {/* Title shown centered when no messages and showTitle true */}
          {messages.length === 0 && showTitle && (
            <div
              style={{
                marginTop: isMobile ? "16vh" : "22vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: isMobile ? 14 : 18,
                padding: isMobile ? "0 12px" : 0,
              }}
            >
              <div
                style={{
                  border: "1px solid #303148",
                  borderRadius: isMobile ? 14 : 18,
                  padding: isMobile ? 9 : 12,
                  background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.04)",
                }}
              >
                <img
                  src={nsAppsLogo}
                  alt="NS Apps Logo"
                  style={{
                    width: isMobile ? "min(155px, 50vw)" : "min(180px, 36vw)",
                    height: "auto",
                    display: "block",
                    borderRadius: isMobile ? 10 : 12,
                    border: "1px solid #3b3f61",
                    background: "#11131d",
                  }}
                />
              </div>

              <h2
                style={{
                  textAlign: "center",
                  color: "#ccc",
                  margin: 0,
                  fontFamily: "sans-serif",
                  letterSpacing: 1,
                  fontSize: isMobile ? 18 : 24,
                  lineHeight: 1.25,
                }}
              >
                NSBOT IS HERE TO ASSIST YOU
              </h2>
            </div>
          )}

          <div ref={endOfMessagesRef} style={{ height: 1, width: 1 }} />
        </div>

        {showJumpToLatest && (
          <button
            onClick={jumpToLatest}
            style={{
              position: "absolute",
              right: isMobile ? 10 : 16,
              bottom: isMobile ? 10 : 16,
              border: "none",
              borderRadius: 999,
              background: "#0a84ff",
              color: "#fff",
              padding: isMobile ? "7px 12px" : "8px 14px",
              fontSize: isMobile ? 12 : 13,
              fontWeight: 600,
              boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
              cursor: "pointer",
            }}
          >
            Jump to latest ↓
          </button>
        )}
      </div>

      {/* fixed chat input wrapper (measured) */}
      <div
        ref={chatInputWrapperRef}
        style={{
          position: "fixed",
          bottom: `calc(${inputBottom}px + env(safe-area-inset-bottom))`,
          left: panelLeft,
          width: panelWidth,
          zIndex: 9999,
        }}
      >
        <ChatInput
          prompt={prompt}
          setPrompt={setPrompt}
          svNo={svNo}
          setSvNo={setSvNo}
          handleSend={handleSend}
          isStreaming={isStreaming}
          isMobile={isMobile}
        />
      </div>
    </div>
  );
}
