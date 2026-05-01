import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Agent, ChatMessage } from "../types";
import { useTerrariumStore, sendChatMessage, requestResetContext } from "./store";
import { agentColor } from "./office-theme";

/**
 * Desk Workbench — readable chat + artifact viewer for an agent room.
 *
 * The room stays playful; this panel is the agent's desk terminal: wide enough
 * for code/research, with visible context controls and better empty prompts.
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
  const streaming = useTerrariumStore((s) => s.streamingMessages.get(agent.id));
  const isLoading = useTerrariumStore((s) => s.chatLoading.has(agent.id));
  const addUserMessage = useTerrariumStore((s) => s.addUserMessage);
  const connection = useTerrariumStore((s) => s.connection);

  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"chat" | "artifacts">("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const allMessages = useMemo(
    () => (streaming ? [...messages, streaming] : messages),
    [messages, streaming],
  );
  const artifactCount = useMemo(
    () => allMessages.reduce((count, m) => count + extractCodeBlocks(m.content).length, 0),
    [allMessages],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming?.content, mode]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text || !ws.current) return;

    if (text === "/reset") {
      requestResetContext(ws.current, agent.id);
      setInput("");
      return;
    }

    addUserMessage(agent.id, text);
    sendChatMessage(ws.current, agent.id, text);
    setInput("");
  };

  const resetContext = () => {
    if (!ws.current) return;
    requestResetContext(ws.current, agent.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isDisconnected = connection !== "open";
  const accent = agentColor(agent);

  return (
    <section style={panelStyle} aria-label={`${agent.name} desk workbench`}>
      <div style={{ ...headerStyle, borderColor: `${accent}55` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AgentAvatar agent={agent} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.1 }}>Desk Workbench</h2>
              <span style={{ ...statusPillStyle, color: accent, borderColor: `${accent}55` }}>
                {agent.state}
              </span>
            </div>
            <p style={{ margin: "5px 0 0", color: "#aeb0ce", fontSize: 12 }}>
              {agent.name} · {agent.specialty} · readable chat, code, and research results
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isLoading && <span style={{ color: "#6cf093", fontSize: 12 }}>working<span className="dots-anim">...</span></span>}
          <button onClick={resetContext} disabled={!ws.current} style={miniButtonStyle} title="Clear this agent's conversation context">
            Reset context
          </button>
        </div>
      </div>

      <div style={tabBarStyle}>
        <button onClick={() => setMode("chat")} style={tabStyle(mode === "chat")}>
          Conversation
        </button>
        <button onClick={() => setMode("artifacts")} style={tabStyle(mode === "artifacts")}>
          Code & Artifacts {artifactCount ? `(${artifactCount})` : ""}
        </button>
      </div>

      {mode === "chat" ? (
        <div style={messagesContainerStyle}>
          {messages.length === 0 && !streaming && <WorkbenchEmptyState agent={agent} accent={accent} />}

          {messages.map((msg) => (
            <MessageBlock key={msg.id} message={msg} agent={agent} />
          ))}

          {streaming && <MessageBlock key="streaming" message={streaming} agent={agent} isStreaming />}
          <div ref={messagesEndRef} />
        </div>
      ) : (
        <ArtifactShelf messages={allMessages} />
      )}

      <div style={inputContainerStyle}>
        {isDisconnected && (
          <div style={disconnectedBannerStyle}>
            {agent.name} is sleeping — Hermes connection is unavailable.
          </div>
        )}
        <div style={composerStyle}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isDisconnected ? "Reconnecting…" : `Ask ${agent.name} to review, research, debug, or plan…`}
            disabled={isDisconnected}
            rows={2}
            style={textareaStyle}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isDisconnected || isLoading}
            style={{
              ...sendButtonStyle,
              background: accent,
              opacity: !input.trim() || isDisconnected || isLoading ? 0.45 : 1,
              cursor: !input.trim() || isDisconnected || isLoading ? "not-allowed" : "pointer",
            }}
          >
            Send
          </button>
        </div>
        <div style={hintStyle}>Enter sends · Shift+Enter adds a line · <code>/reset</code> also clears context</div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function WorkbenchEmptyState({ agent, accent }: { agent: Agent; accent: string }) {
  const prompts = [
    `Review this function for bugs`,
    `Research the tradeoffs and cite sources`,
    `Debug this error step-by-step`,
    `Turn this plan into implementation steps`,
  ];
  return (
    <div style={emptyStyle}>
      <div style={{ fontSize: 34, marginBottom: 8 }}>🖥️</div>
      <h3 style={{ margin: "0 0 8px", color: "#f4f4ff" }}>{agent.name}'s desk is ready.</h3>
      <p style={{ margin: "0 auto 18px", maxWidth: 560, color: "#9fa2c7", lineHeight: 1.6 }}>
        Use this workbench for readable answers: code blocks, research notes, plans, and long explanations.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {prompts.map((prompt) => (
          <div key={prompt} style={{ ...promptCardStyle, borderColor: `${accent}44` }}>
            {prompt}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentAvatar({ agent }: { agent: Agent }) {
  const bg = agentColor(agent);
  return (
    <div style={{ ...avatarStyle, background: bg }}>
      {agent.name[0]}
    </div>
  );
}

function MessageBlock({
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
    <article style={{ ...messageBlockStyle, alignSelf: isUser ? "flex-end" : "stretch", maxWidth: isUser ? "78%" : "100%" }}>
      <div style={messageMetaStyle}>
        <span>{isUser ? "You" : agent.name}</span>
        <time>{formatTime(message.timestamp)}</time>
      </div>
      <div style={isUser ? userBubbleStyle : assistantPaperStyle}>
        <RenderedContent content={message.content} />
        {isStreaming && <span style={cursorStyle}>▊</span>}
      </div>
    </article>
  );
}

function ArtifactShelf({ messages }: { messages: ChatMessage[] }) {
  const artifacts = messages.flatMap((message) =>
    extractCodeBlocks(message.content).map((block, index) => ({ ...block, messageId: message.id, index })),
  );

  if (artifacts.length === 0) {
    return (
      <div style={artifactEmptyStyle}>
        <div style={{ fontSize: 30 }}>📎</div>
        <h3 style={{ margin: "10px 0 6px" }}>No code artifacts yet</h3>
        <p style={{ margin: 0, color: "#8e91b5" }}>
          Code fences from assistant replies will collect here for quick reading and copying.
        </p>
      </div>
    );
  }

  return (
    <div style={artifactShelfStyle}>
      {artifacts.map((artifact) => (
        <CodeBlock
          key={`${artifact.messageId}-${artifact.index}`}
          code={artifact.code}
          language={artifact.language}
          compact={false}
        />
      ))}
    </div>
  );
}

/** Markdown-ish renderer tuned for readable code/research output. */
function RenderedContent({ content }: { content: string }) {
  if (!content) return null;
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const { language, code } = parseCodeFence(part);
          return <CodeBlock key={i} code={code} language={language} />;
        }
        return <span key={i}>{renderInline(part)}</span>;
      })}
    </>
  );
}

function CodeBlock({ code, language, compact = true }: { code: string; language: string; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const lineCount = code.split("\n").length;
  const canCollapse = compact && lineCount > 14;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div style={codeShellStyle}>
      <div style={codeHeaderStyle}>
        <span>{language || "code"} · {lineCount} lines</span>
        <div style={{ display: "flex", gap: 6 }}>
          {canCollapse && (
            <button onClick={() => setExpanded((v) => !v)} style={codeButtonStyle}>
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}
          <button onClick={copy} style={codeButtonStyle}>{copied ? "Copied" : "Copy"}</button>
        </div>
      </div>
      <pre style={{ ...codeBlockStyle, maxHeight: canCollapse && !expanded ? 280 : undefined }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenPattern = /(`[^`]+`|\[[^\]]+\]\([^\s)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let index = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > lastIndex) {
      nodes.push(<span key={`t-${index++}`}>{text.slice(lastIndex, start)}</span>);
    }

    if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={`t-${index++}`} style={inlineCodeStyle}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={`t-${index++}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={`t-${index++}`}>{token.slice(1, -1)}</em>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
      if (link) {
        nodes.push(
          <a key={`t-${index++}`} href={link[2]} target="_blank" rel="noreferrer" style={linkStyle}>
            {link[1]}
          </a>,
        );
      } else {
        nodes.push(<span key={`t-${index++}`}>{token}</span>);
      }
    }
    lastIndex = start + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(<span key={`t-${index++}`}>{text.slice(lastIndex)}</span>);
  }
  return nodes;
}

function extractCodeBlocks(content: string): Array<{ language: string; code: string }> {
  return [...content.matchAll(/```([\w+-]*)?\n?([\s\S]*?)```/g)].map((match) => ({
    language: match[1] || "code",
    code: match[2] ?? "",
  }));
}

function parseCodeFence(fence: string): { language: string; code: string } {
  const inner = fence.slice(3, -3);
  const firstNewline = inner.indexOf("\n");
  if (firstNewline < 0) return { language: "code", code: inner };
  const possibleLanguage = inner.slice(0, firstNewline).trim();
  const hasLanguage = /^[\w+-]+$/.test(possibleLanguage);
  return {
    language: hasLanguage ? possibleLanguage : "code",
    code: hasLanguage ? inner.slice(firstNewline + 1) : inner,
  };
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const EMPTY_MESSAGES: ChatMessage[] = [];

const panelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "min(76vh, 720px)",
  minHeight: 560,
  background: "linear-gradient(180deg, rgba(11, 13, 31, 0.97), rgba(6, 8, 19, 0.97))",
  border: "1px solid #2a2f58",
  borderRadius: 22,
  overflow: "hidden",
  boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  padding: "16px 18px",
  borderBottom: "1px solid #2a2f58",
  background: "rgba(16, 21, 47, 0.78)",
  flexShrink: 0,
};

const tabBarStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "10px 14px",
  borderBottom: "1px solid #202645",
  background: "rgba(4, 7, 18, 0.55)",
};

const tabStyle = (active: boolean): CSSProperties => ({
  padding: "8px 12px",
  borderRadius: 999,
  border: active ? "1px solid #6b9dff" : "1px solid #313657",
  background: active ? "rgba(107,157,255,0.18)" : "rgba(255,255,255,0.03)",
  color: active ? "#d8e5ff" : "#8e91b5",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
});

const statusPillStyle: CSSProperties = {
  padding: "3px 7px",
  borderRadius: 999,
  border: "1px solid",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 0.8,
};

const avatarStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 14,
  flexShrink: 0,
  display: "grid",
  placeItems: "center",
  fontSize: 18,
  fontWeight: 900,
  color: "#03040b",
  boxShadow: "0 0 22px rgba(107,157,255,0.3)",
};

const miniButtonStyle: CSSProperties = {
  padding: "7px 10px",
  border: "1px solid #39406a",
  borderRadius: 10,
  background: "rgba(255,255,255,0.04)",
  color: "#cbd0f0",
  cursor: "pointer",
  fontSize: 12,
};

const messagesContainerStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: "20px 22px 26px",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const emptyStyle: CSSProperties = {
  margin: "auto",
  width: "100%",
  maxWidth: 720,
  textAlign: "center",
  color: "#777b9e",
};

const promptCardStyle: CSSProperties = {
  padding: "12px 14px",
  border: "1px solid",
  borderRadius: 14,
  background: "rgba(255,255,255,0.035)",
  color: "#d8dcff",
  fontSize: 13,
  textAlign: "left",
};

const messageBlockStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const messageMetaStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  color: "#777b9e",
  fontSize: 11,
  padding: "0 4px",
};

const assistantPaperStyle: CSSProperties = {
  padding: "16px 18px",
  borderRadius: 18,
  background: "linear-gradient(180deg, rgba(30,34,66,0.94), rgba(20,23,48,0.94))",
  border: "1px solid #343a66",
  color: "#eef0ff",
  fontSize: 14,
  lineHeight: 1.7,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const userBubbleStyle: CSSProperties = {
  padding: "12px 15px",
  borderRadius: "18px 18px 4px 18px",
  background: "#2d3875",
  border: "1px solid #4655a0",
  color: "#f2f5ff",
  fontSize: 14,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const inputContainerStyle: CSSProperties = {
  padding: "14px 16px",
  borderTop: "1px solid #202645",
  background: "rgba(9, 12, 29, 0.92)",
  flexShrink: 0,
};

const composerStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 10,
  alignItems: "end",
};

const textareaStyle: CSSProperties = {
  minHeight: 56,
  maxHeight: 150,
  background: "#070a18",
  border: "1px solid #39406a",
  borderRadius: 14,
  padding: "12px 14px",
  color: "#eef0ff",
  fontSize: 14,
  resize: "vertical",
  outline: "none",
  fontFamily: "inherit",
  lineHeight: 1.5,
};

const sendButtonStyle: CSSProperties = {
  height: 56,
  minWidth: 76,
  borderRadius: 14,
  border: "none",
  color: "#03040b",
  fontSize: 13,
  fontWeight: 900,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const hintStyle: CSSProperties = {
  marginTop: 8,
  color: "#6e7294",
  fontSize: 11,
};

const disconnectedBannerStyle: CSSProperties = {
  padding: "8px 10px",
  marginBottom: 10,
  borderRadius: 10,
  background: "rgba(240, 108, 108, 0.12)",
  border: "1px solid rgba(240, 108, 108, 0.3)",
  color: "#f0a0a0",
  fontSize: 12,
  textAlign: "center",
};

const cursorStyle: CSSProperties = {
  display: "inline-block",
  animation: "blink 1s step-end infinite",
  color: "#6b9dff",
  marginLeft: 2,
};

const codeShellStyle: CSSProperties = {
  margin: "12px 0",
  border: "1px solid #30375f",
  borderRadius: 14,
  overflow: "hidden",
  background: "#070917",
};

const codeHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "8px 10px",
  borderBottom: "1px solid #262d50",
  color: "#aeb7e8",
  background: "rgba(107,157,255,0.08)",
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 11,
};

const codeButtonStyle: CSSProperties = {
  padding: "4px 7px",
  borderRadius: 7,
  border: "1px solid #46507d",
  background: "rgba(255,255,255,0.06)",
  color: "#dbe4ff",
  cursor: "pointer",
  fontSize: 11,
};

const codeBlockStyle: CSSProperties = {
  margin: 0,
  padding: "13px 14px",
  overflow: "auto",
  fontSize: 12.5,
  fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
  lineHeight: 1.55,
  color: "#e7ecff",
};

const linkStyle: CSSProperties = {
  color: "#8fb5ff",
  textDecoration: "underline",
  textUnderlineOffset: 3,
};

const inlineCodeStyle: CSSProperties = {
  background: "rgba(107, 157, 255, 0.16)",
  border: "1px solid rgba(107, 157, 255, 0.25)",
  borderRadius: 5,
  padding: "1px 5px",
  fontSize: "0.92em",
  fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
};

const artifactShelfStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: "18px 22px",
};

const artifactEmptyStyle: CSSProperties = {
  flex: 1,
  display: "grid",
  placeContent: "center",
  textAlign: "center",
  color: "#c5c9e8",
  padding: 24,
};
