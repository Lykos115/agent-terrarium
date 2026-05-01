import { useEffect, useRef, useState } from "react";
import { useTerrarium } from "./useTerrarium";
import { pathToRoute, useTerrariumStore, requestCreateAgent, requestRestoreAgent } from "./store";
import EmptyTerrarium from "./EmptyTerrarium";
import { DollhouseGrid } from "./DollhouseGrid";
import { SummoningWizard } from "./SummoningWizard";
import { AgentRoom } from "./AgentRoom";

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
  const { ws } = useTerrarium(); // establishes the single WS connection

  const agentListLoaded = useTerrariumStore((s) => s.agentListLoaded);
  const agents = useTerrariumStore((s) => s.agents);
  const route = useTerrariumStore((s) => s.route);
  const replaceRoute = useTerrariumStore((s) => s.replaceRoute);
  const connection = useTerrariumStore((s) => s.connection);
  const lastError = useTerrariumStore((s) => s.lastError);
  const clearError = useTerrariumStore((s) => s.clearError);

  const isEmpty = agentListLoaded && agents.size === 0;
  const [emptyDissolving, setEmptyDissolving] = useState(false);
  const wasEmpty = useRef(isEmpty);

  useEffect(() => {
    const syncFromLocation = () => replaceRoute(pathToRoute(window.location.pathname));
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, [replaceRoute]);

  useEffect(() => {
    if (wasEmpty.current && !isEmpty && agentListLoaded && agents.size > 0) {
      setEmptyDissolving(true);
      const timeout = window.setTimeout(() => setEmptyDissolving(false), 650);
      wasEmpty.current = isEmpty;
      return () => window.clearTimeout(timeout);
    }

    wasEmpty.current = isEmpty;
  }, [agentListLoaded, agents.size, isEmpty]);

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
      {!(agentListLoaded && agents.size > 0 && route.name === "grid") && (
        <Header connection={connection} />
      )}

      <main style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
        {!agentListLoaded ? (
          <LoadingView />
        ) : isEmpty ? (
          <EmptyTerrarium />
        ) : (
          <ViewFadeIn>
            {route.name === "grid" ? (
              <DollhouseGrid />
            ) : route.name === "room" ? (
              <AgentRoomView agentId={route.agentId} ws={ws} />
            ) : (
              <AgentEditorPlaceholder agentId={route.agentId} />
            )}
          </ViewFadeIn>
        )}
        {emptyDissolving && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
            <EmptyTerrarium dissolving />
          </div>
        )}
      </main>

      {/*
        Wizard is rendered unconditionally; it reads ui.wizardOpen internally
        and returns null when closed. Opened from either the empty-state
        portal (#5) or the grid's "+ Summon" button (#6).
      */}
      <SummoningWizard
        onSummon={(config) => {
          if (ws.current) requestCreateAgent(ws.current, config);
        }}
        onRestore={(agentId) => {
          if (ws.current) requestRestoreAgent(ws.current, agentId);
        }}
      />

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

function ViewFadeIn({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        animation: "view-fade-in 650ms ease-out both",
      }}
    >
      <style>{`
        @keyframes view-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {children}
    </div>
  );
}

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

function AgentRoomView({ agentId, ws }: { agentId: string; ws: React.MutableRefObject<WebSocket | null> }) {
  const agent = useTerrariumStore((s) => s.agents.get(agentId));
  if (!agent) {
    return <div style={{ padding: 24 }}>Agent not found.</div>;
  }
  return <AgentRoom agent={agent} ws={ws} />;
}

function AgentEditorPlaceholder({ agentId }: { agentId: string }) {
  return (
    <div style={{ padding: 24 }}>
      Agent editor for <code>{agentId}</code> (placeholder)
    </div>
  );
}
