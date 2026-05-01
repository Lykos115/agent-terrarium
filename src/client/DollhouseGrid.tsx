import { useMemo } from "react";
import { RoomTile } from "./RoomTile";
import { useTerrariumStore } from "./store";

/**
 * Dollhouse Grid — responsive CSS grid of agent room tiles.
 * Each tile shows a PixiJS canvas with the agent's animated sprite.
 * Includes a "+ Summon" button to open the wizard.
 */
export function DollhouseGrid() {
  // Select the stable Map reference — NEVER call s.agentList() inside a
  // Zustand selector, it returns a fresh array each snapshot and triggers
  // an infinite re-render loop ("The result of getSnapshot should be cached").
  const agentsMap = useTerrariumStore((s) => s.agents);
  const agents = useMemo(
    () =>
      Array.from(agentsMap.values()).sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      ),
    [agentsMap],
  );
  const setWizardOpen = useTerrariumStore((s) => s.setWizardOpen);

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 1400,
        margin: "0 auto",
      }}
    >
      {/* Header with title and summon button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            margin: 0,
            letterSpacing: 0.5,
            color: "#e5e5f0",
          }}
        >
          Agent Terrarium
          <span style={{ fontSize: 14, opacity: 0.5, marginLeft: 12 }}>
            {agents.length} {agents.length === 1 ? "agent" : "agents"}
          </span>
        </h2>

        <button
          onClick={() => setWizardOpen(true)}
          style={{
            padding: "10px 18px",
            background: "linear-gradient(135deg, #6cf093 0%, #44ddaa 100%)",
            border: "none",
            borderRadius: 6,
            color: "#0f0f23",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            transition: "transform 0.2s, box-shadow 0.2s",
            boxShadow: "0 2px 8px rgba(108, 240, 147, 0.3)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow =
              "0 4px 12px rgba(108, 240, 147, 0.5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow =
              "0 2px 8px rgba(108, 240, 147, 0.3)";
          }}
        >
          + Summon Agent
        </button>
      </div>

      {/* Responsive grid of room tiles */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 20,
        }}
      >
        {agents.map((agent) => (
          <RoomTile key={agent.id} agent={agent} />
        ))}
      </div>

      {/* Empty state hint (shouldn't normally show since empty → portal) */}
      {agents.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            color: "#666",
            fontSize: 14,
          }}
        >
          No agents yet. Click "Summon Agent" to create your first one.
        </div>
      )}
    </div>
  );
}
