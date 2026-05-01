import { useTerrarium } from "./useTerrarium";
import { useTerrariumStore } from "./store";

/**
 * App shell.
 *
 * Owns the single WebSocket connection (via `useTerrarium`) and dispatches
 * to one of three top-level views based on the current route + whether
 * any agents exist:
 *
 *   - empty-state portal  (#5)   → when `agentListLoaded && agents.size === 0`
 *   - dollhouse grid      (#6)   → when route.name === "grid"
 *   - agent room          (#10)  → when route.name === "room"
 *
 * Sub-agent work (Layer 2) slots components into the three placeholders
 * below. Each placeholder is a named function so the diff of "plug in the
 * real component" is just a single import swap.
 */
export default function App() {
  useTerrarium(); // establishes the single WS connection

  const agentListLoaded = useTerrariumStore((s) => s.agentListLoaded);
  const agents = useTerrariumStore((s) => s.agents);
  const route = useTerrariumStore((s) => s.route);
  const connection = useTerrariumStore((s) => s.connection);
  const lastError = useTerrariumStore((s) => s.lastError);
  const clearError = useTerrariumStore((s) => s.clearError);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f23",
        color: "#e5e5f0",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Header connection={connection} />

      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {!agentListLoaded ? (
          <LoadingView />
        ) : agents.size === 0 ? (
          <EmptyTerrariumPlaceholder />
        ) : route.name === "grid" ? (
          <DollhouseGridPlaceholder />
        ) : route.name === "room" ? (
          <AgentRoomPlaceholder agentId={route.agentId} />
        ) : (
          <AgentEditorPlaceholder agentId={route.agentId} />
        )}
      </main>

      {lastError && <ErrorToast message={lastError} onDismiss={clearError} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

function Header({ connection }: { connection: "connecting" | "open" | "closed" }) {
  const color =
    connection === "open" ? "#6cf093" : connection === "closed" ? "#f06c6c" : "#f0d86c";
  const label =
    connection === "open"
      ? "Connected"
      : connection === "closed"
        ? "Disconnected"
        : "Connecting…";

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 24px",
        borderBottom: "1px solid #2a2a4a",
      }}
    >
      <h1 style={{ fontSize: 20, margin: 0, letterSpacing: 1 }}>
        Agent Terrarium
      </h1>
      <div
        title={label}
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: color,
            boxShadow: `0 0 8px ${color}`,
          }}
        />
        <span style={{ color: "#aaa" }}>{label}</span>
      </div>
    </header>
  );
}

function ErrorToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      onClick={onDismiss}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        background: "#4a1a1a",
        border: "1px solid #f06c6c",
        color: "#ffd6d6",
        padding: "10px 16px",
        borderRadius: 6,
        maxWidth: 400,
        cursor: "pointer",
        fontSize: 13,
      }}
    >
      {message}
      <div style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>
        (click to dismiss)
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View placeholders — swapped for real components by Layer 2 subagents
// ---------------------------------------------------------------------------

function LoadingView() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#666",
      }}
    >
      Loading…
    </div>
  );
}

/** Replaced by #5: Empty Terrarium First-Run Experience. */
function EmptyTerrariumPlaceholder() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
        color: "#666",
      }}
    >
      <div style={{ fontSize: 48 }}>◉</div>
      <div>The terrarium awaits.</div>
      <div style={{ fontSize: 12, opacity: 0.5 }}>
        (Empty-state portal — issue #5)
      </div>
    </div>
  );
}

/** Replaced by #6: Dollhouse Grid with Agent Sprites. */
function DollhouseGridPlaceholder() {
  const agents = useTerrariumStore((s) => s.agentList());
  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, fontSize: 14, opacity: 0.6 }}>
        (Dollhouse grid placeholder — issue #6)
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 16,
        }}
      >
        {agents.map((a) => (
          <div
            key={a.id}
            style={{
              border: "1px solid #3a3a6a",
              borderRadius: 6,
              padding: 16,
              background: "#1a1a2e",
              minHeight: 140,
            }}
          >
            <div style={{ fontWeight: 600 }}>{a.name}</div>
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
              {a.specialty}
            </div>
            <div style={{ fontSize: 11, opacity: 0.4, marginTop: 8 }}>
              {a.state} · {a.modelTier}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Replaced by #10: Agent Room Zoom & Curtain Transition. */
function AgentRoomPlaceholder({ agentId }: { agentId: string }) {
  return (
    <div style={{ padding: 24 }}>
      Agent room for <code>{agentId}</code> (placeholder — issue #10)
    </div>
  );
}

function AgentEditorPlaceholder({ agentId }: { agentId: string }) {
  return (
    <div style={{ padding: 24 }}>
      Agent editor for <code>{agentId}</code> (placeholder)
    </div>
  );
}
