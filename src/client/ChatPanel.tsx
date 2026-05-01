import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Agent, ChatMessage } from "../types";
import { useTerrariumStore, sendChatMessage, requestResetContext } from "./store";

/**
 * ChatPanel — right-side chat panel for an agent room.
 *
 * Renders the conversation history, a streaming "live" message, an input
 * field, and handles `/reset` as a slash command to clear context.
 *
 * PRD user stories: #10, #11, #12, #13, #14, #15
 */
export function ChatPanel({
  agent,
  ws,
}: {
  agent: Agent;
  ws: React.MutableRefObject<WebSocket | null>;
}) {
  const messages = useTerrariumStore(
    (s) => s.chatHistory.get(agent.id) ?? EMPTY_MESSAGES,
  );
  const streaming = useTerrariumStore((s) =>
    s.streamingMessages.get(agent.id),
  );
  const isLoading = useTerrariumStore((s) => s.chatLoading.has(agent.id));
  const addUserMessage = useTerrariumStore((s) => s.addUserMessage);
  const connection = useTerrariumStore((s) => s.connection);

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming?.content]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text || !ws.current) return;

    // Handle slash commands
    if (text === "/reset") {
      requestResetContext(ws.current, agent.id);
      setInput("");
      return;
    }

    addUserMessage(agent.id, text);
    sendChatMessage(ws.current, agent.id, text);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isDisconnected = connection !== "open";

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AgentAvatar agent={agent} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{agent.name}</div>
            <div style={{ fontSize: 11, color: "#9294b8" }}>
              {agent.specialty} · {agent.state}
            </div>
          </div>
        </div>
        {isLoading && (
          <div style={{ fontSize: 11, color: "#6cf093" }}>
            typing<span className="dots-anim">...</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={messagesContainerStyle}>
        {messages.length === 0 && !streaming && (
          <div style={emptyStyle}>
            Start a conversation with {agent.name}.
            <br />
            <span style={{ fontSize: 11, color: "#555" }}>
              Type <code>/reset</code> to clear context.
            </span>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} agent={agent} />
        ))}

        {streaming && (
          <MessageBubble
            key="streaming"
            message={streaming}
            agent={agent}
            isStreaming
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={inputContainerStyle}>
        {isDisconnected && (
          <div style={disconnectedBannerStyle}>
            {agent.name} is sleeping — connection lost
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isDisconnected
                ? "Reconnecting…"
                : `Talk to ${agent.name}…`
            }
            disabled={isDisconnected}
            rows={1}
            style={textareaStyle}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isDisconnected || isLoading}
            style={{
              ...sendButtonStyle,
              opacity:
                !input.trim() || isDisconnected || isLoading ? 0.4 : 1,
              cursor:
                !input.trim() || isDisconnected || isLoading
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AgentAvatar({ agent }: { agent: Agent }) {
  const colors: Record<string, string> = {
    "sprite-glitchkin": "#ff6b6b",
    "sprite-mapsie": "#6bff8e",
    "sprite-blipblop": "#6b9dff",
  };
  const bg = colors[agent.spriteId] ?? "#8b5cf6";
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: bg,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        fontWeight: 700,
        color: "#000",
      }}
    >
      {agent.name[0]}
    </div>
  );
}

function MessageBubble({
  message,
  agent,
  isStreaming,
}: {
  message: ChatMessage;
  agent: Agent;
  isStreaming?: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#666",
          marginBottom: 4,
          paddingLeft: isUser ? 0 : 4,
          paddingRight: isUser ? 4 : 0,
        }}
      >
        {isUser ? "You" : agent.name}
      </div>
      <div
        style={{
          maxWidth: "85%",
          padding: "10px 14px",
          borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          background: isUser ? "#2d3875" : "#1e1e38",
          border: isUser ? "1px solid #3d4a8a" : "1px solid #2a2a4a",
          color: "#e5e5f0",
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        <RenderedContent content={message.content} />
        {isStreaming && <span style={cursorStyle}>▊</span>}
      </div>
    </div>
  );
}

/**
 * Simple markdown-ish renderer for chat messages.
 * Handles: code blocks (```), inline code (`), bold (**), and newlines.
 * Full markdown lib can be added later if needed.
 */
function RenderedContent({ content }: { content: string }) {
  if (!content) return null;

  // Split on fenced code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const inner = part.slice(3, -3);
          // Strip optional language tag on first line
          const firstNewline = inner.indexOf("\n");
          const code = firstNewline >= 0 ? inner.slice(firstNewline + 1) : inner;
          return (
            <pre key={i} style={codeBlockStyle}>
              <code>{code}</code>
            </pre>
          );
        }

        // Handle inline formatting
        return <span key={i}>{renderInline(part)}</span>;
      })}
    </>
  );
}

function renderInline(text: string): React.ReactNode[] {
  // Split on inline code
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} style={inlineCodeStyle}>
          {part.slice(1, -1)}
        </code>
      );
    }
    // Handle bold
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    return boldParts.map((bp, j) => {
      if (bp.startsWith("**") && bp.endsWith("**")) {
        return (
          <strong key={`${i}-${j}`}>{bp.slice(2, -2)}</strong>
        );
      }
      return <span key={`${i}-${j}`}>{bp}</span>;
    });
  });
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const EMPTY_MESSAGES: ChatMessage[] = [];

const panelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  maxHeight: "100%",
  background: "rgba(10, 10, 25, 0.92)",
  border: "1px solid #2a2a4a",
  borderRadius: 18,
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 16px",
  borderBottom: "1px solid #2a2a4a",
  background: "rgba(15, 15, 35, 0.6)",
  flexShrink: 0,
};

const messagesContainerStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "16px 14px",
  display: "flex",
  flexDirection: "column",
};

const emptyStyle: CSSProperties = {
  textAlign: "center",
  color: "#666",
  fontSize: 13,
  marginTop: 40,
  lineHeight: 1.8,
};

const inputContainerStyle: CSSProperties = {
  padding: "12px 14px",
  borderTop: "1px solid #2a2a4a",
  background: "rgba(15, 15, 35, 0.4)",
  flexShrink: 0,
};

const textareaStyle: CSSProperties = {
  flex: 1,
  background: "#0f0f23",
  border: "1px solid #3a3a6a",
  borderRadius: 10,
  padding: "10px 14px",
  color: "#e5e5f0",
  fontSize: 13,
  resize: "none",
  outline: "none",
  fontFamily: "inherit",
  lineHeight: 1.5,
};

const sendButtonStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 10,
  border: "1px solid #3a3a6a",
  background: "#6b9dff",
  color: "#0f0f23",
  fontSize: 18,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const disconnectedBannerStyle: CSSProperties = {
  padding: "6px 10px",
  marginBottom: 8,
  borderRadius: 8,
  background: "rgba(240, 108, 108, 0.12)",
  border: "1px solid rgba(240, 108, 108, 0.3)",
  color: "#f0a0a0",
  fontSize: 11,
  textAlign: "center",
};

const cursorStyle: CSSProperties = {
  display: "inline-block",
  animation: "blink 1s step-end infinite",
  color: "#6b9dff",
  marginLeft: 2,
};

const codeBlockStyle: CSSProperties = {
  background: "#0a0a1a",
  border: "1px solid #2a2a4a",
  borderRadius: 8,
  padding: "10px 12px",
  margin: "8px 0",
  overflow: "auto",
  fontSize: 12,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  lineHeight: 1.5,
};

const inlineCodeStyle: CSSProperties = {
  background: "rgba(107, 157, 255, 0.15)",
  border: "1px solid rgba(107, 157, 255, 0.2)",
  borderRadius: 4,
  padding: "1px 5px",
  fontSize: "0.9em",
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
};
