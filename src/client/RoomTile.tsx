import { useEffect, useRef } from "react";
import { Application } from "pixi.js";
import type { Agent } from "../types";
import { PixiSpriteActor, PixiRoom } from "../modules/sprite-engine";
import { useTerrariumStore } from "./store";

interface RoomTileProps {
  agent: Agent;
}

/**
 * A single room tile: mounts a PixiJS canvas, creates a Room + SpriteActor
 * for the given agent, and displays the agent name/specialty overlay.
 * Clicking navigates to the agent's full room view.
 */
export function RoomTile({ agent }: RoomTileProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const roomRef = useRef<PixiRoom | null>(null);
  const actorRef = useRef<PixiSpriteActor | null>(null);

  const setRoute = useTerrariumStore((s) => s.setRoute);

  // Initialize PixiJS on mount
  useEffect(() => {
    if (!canvasRef.current) return;

    let app: Application;
    let room: PixiRoom;
    let actor: PixiSpriteActor;

    (async () => {
      // Create PixiJS app
      app = new Application();
      await app.init({
        width: 260,
        height: 180,
        backgroundColor: 0x1a1a2e,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });

      if (!canvasRef.current) return; // unmounted during init

      canvasRef.current.appendChild(app.canvas);
      appRef.current = app;

      // Create room and actor
      room = new PixiRoom(app);
      roomRef.current = room;

      actor = new PixiSpriteActor(app, agent.spriteId, 24);
      actorRef.current = actor;

      // Position actor at center of canvas
      room.addActor(actor, 130, 90);
      actor.setState(agent.state);
    })();

    return () => {
      // Cleanup on unmount
      if (actorRef.current) {
        actorRef.current.destroy();
        actorRef.current = null;
      }
      if (roomRef.current) {
        roomRef.current.destroy();
        roomRef.current = null;
      }
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, [agent.spriteId]); // re-create if spriteId changes (rare)

  // Update agent state when it changes
  useEffect(() => {
    if (actorRef.current) {
      actorRef.current.setState(agent.state);
    }
  }, [agent.state]);

  const handleClick = () => {
    setRoute({ name: "room", agentId: agent.id });
  };

  return (
    <div
      onClick={handleClick}
      style={{
        position: "relative",
        border: "1px solid #3a3a6a",
        borderRadius: 8,
        overflow: "hidden",
        cursor: "pointer",
        transition: "border-color 0.2s, transform 0.2s",
        background: "#0f0f23",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#6cf093";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#3a3a6a";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* PixiJS canvas container */}
      <div ref={canvasRef} style={{ display: "block" }} />

      {/* Agent info overlay (HTML on top of canvas) */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "8px 12px",
          background: "rgba(15, 15, 35, 0.85)",
          backdropFilter: "blur(4px)",
          borderTop: "1px solid rgba(58, 58, 106, 0.5)",
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: 14,
            marginBottom: 2,
            color: "#e5e5f0",
          }}
        >
          {agent.name}
        </div>
        <div
          style={{
            fontSize: 11,
            opacity: 0.7,
            color: "#aaa",
          }}
        >
          {agent.specialty}
        </div>
      </div>
    </div>
  );
}
