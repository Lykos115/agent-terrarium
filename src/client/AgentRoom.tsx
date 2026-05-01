import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Application } from "pixi.js";
import { PixiSpriteActor } from "../modules/sprite-engine";
import type { Agent } from "../types";
import { requestArchiveAgent, useTerrariumStore } from "./store";
import {
  type RoomCustomization,
  useRoomCustomization,
} from "./room-customization";
import { ChatPanel } from "./ChatPanel";
import { themeForAgent } from "./office-theme";
import { AgentSpeechBubble } from "./AgentSpeechBubble";
import { wakeAgent } from "./useAgentAutoSleep";

export function AgentRoom({ agent, ws }: { agent: Agent; ws: React.MutableRefObject<WebSocket | null> }) {
  const setRoute = useTerrariumStore((s) => s.setRoute);
  const [room, setRoom] = useRoomCustomization(agent.id);
  const [dismissing, setDismissing] = useState(false);
  const streaming = useTerrariumStore((s) => s.streamingMessages.get(agent.id));
  const isChatLoading = useTerrariumStore((s) => s.chatLoading.has(agent.id));
  const theme = themeForAgent(agent);
  const visualState = useMemo(() => {
    if (streaming) return "working";
    if (isChatLoading) return "thinking";
    return agent.state;
  }, [agent.state, isChatLoading, streaming]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const actorRef = useRef<PixiSpriteActor | null>(null);
  const dismissTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    let app: Application;
    let actor: PixiSpriteActor;

    (async () => {
      app = new Application();
      await app.init({
        width: 520,
        height: 360,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });

      if (!canvasRef.current) return;
      canvasRef.current.appendChild(app.canvas);
      appRef.current = app;

      actor = new PixiSpriteActor(app, agent.spriteId, 42);
      actorRef.current = actor;
      actor.setPosition(260, 245);
      app.stage.addChild(actor.getContainer());
      actor.setState(agent.state);
    })();

    return () => {
      if (dismissTimeoutRef.current) window.clearTimeout(dismissTimeoutRef.current);
      actorRef.current?.destroy();
      actorRef.current = null;
      appRef.current?.destroy(true, { children: true });
      appRef.current = null;
    };
  }, [agent.spriteId]);

  useEffect(() => {
    actorRef.current?.setState(visualState);
  }, [visualState]);

  useEffect(() => {
    if (visualState !== "idle" || dismissing) return;
    let cancelled = false;
    let timer: number | null = null;

    const wander = () => {
      if (cancelled) return;
      const x = 120 + Math.random() * 280;
      const y = 205 + Math.random() * 85;
      actorRef.current?.walkTo(x, y, 1_800 + Math.random() * 900);
      timer = window.setTimeout(wander, 3_200 + Math.random() * 3_000);
    };

    timer = window.setTimeout(wander, 1_200 + Math.random() * 1_500);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [visualState, dismissing]);

  const uploadImage = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setRoom({ ...room, imageDataUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const dismissAgent = () => {
    if (!ws.current || dismissing) return;
    const confirmed = window.confirm(`Dismiss ${agent.name}? They will be archived and can be restored later.`);
    if (!confirmed) return;
    setDismissing(true);
    actorRef.current?.walkTo(500, 250, 1_200);
    dismissTimeoutRef.current = window.setTimeout(() => {
      if (ws.current) requestArchiveAgent(ws.current, agent.id);
    }, 1_500);
  };

  const bubbleText = dismissing
    ? `${agent.name} is heading out…`
    : streaming?.content
      ? summarizeForBubble(streaming.content)
      : isChatLoading
      ? "I'll check my desk terminal…"
      : undefined;

  return (
    <div style={{ padding: 24, maxWidth: 1480, margin: "0 auto", width: "100%" }}>
      <button
        onClick={() => setRoute({ name: "grid" })}
        style={ghostButtonStyle}
      >
        ← All rooms
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(460px, 0.95fr) minmax(560px, 1.25fr)",
          gap: 24,
          alignItems: "start",
          marginTop: 18,
        }}
      >
        <div style={{ display: "grid", gap: 14 }}>
          <section
            onClick={() => wakeAgent(agent, ws)}
            style={{
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 24,
              overflow: "hidden",
              background: "#111123",
              boxShadow: `0 24px 80px ${theme.accent}33`,
              position: "relative",
              cursor: agent.state === "sleeping" ? "pointer" : "default",
            }}
          >
            <RoomScene agent={agent} roomImage={room.imageDataUrl}>
              <div
                ref={canvasRef}
                className={dismissing ? "agent-dismiss-dissolve" : undefined}
                style={{ position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none" }}
              />
              <AgentSpeechBubble
                agent={agent}
                text={bubbleText}
                scale="room"
                style={{ left: "38%", top: "21%" }}
              />
              {agent.state === "sleeping" && <div style={roomZzzStyle}>Zzz</div>}
            </RoomScene>
          </section>

          <RoomSettingsCard
            agent={agent}
            room={room}
            setRoom={setRoom}
            uploadImage={uploadImage}
            dismissing={dismissing}
            onDismiss={dismissAgent}
          />
        </div>

        <ChatPanel agent={agent} ws={ws} />
      </div>
    </div>
  );
}

function RoomSettingsCard({
  agent,
  room,
  setRoom,
  uploadImage,
  dismissing,
  onDismiss,
}: {
  agent: Agent;
  room: RoomCustomization;
  setRoom: (next: RoomCustomization) => void;
  uploadImage: (file: File | undefined) => void;
  dismissing: boolean;
  onDismiss: () => void;
}) {
  return (
    <aside
      style={{
        border: "1px solid #2f3159",
        borderRadius: 18,
        padding: 16,
        background: "rgba(10, 10, 25, 0.72)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>{agent.name}</h2>
          <p style={{ margin: 0, color: "#aeb0ce", fontSize: 12 }}>
            {agent.specialty} · {agent.state}
          </p>
        </div>
        <span style={{ color: "#7f83a5", fontSize: 11 }}>Room controls</span>
      </div>

      <label style={labelStyle}>Backdrop image</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => uploadImage(event.currentTarget.files?.[0])}
          style={{ color: "#cfd0e8", maxWidth: 260 }}
          disabled={dismissing}
        />
        {room.imageDataUrl && (
          <button
            onClick={() => setRoom({ ...room, imageDataUrl: undefined })}
            style={ghostButtonStyle}
            disabled={dismissing}
          >
            Remove image
          </button>
        )}
      </div>

      <div style={dangerZoneStyle}>
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: 15, color: "#ffd0d0" }}>Dismiss Agent</h3>
          <p style={{ margin: 0, color: "#aeb0ce", fontSize: 12, lineHeight: 1.5 }}>
            Archive {agent.name} after a short walk-off animation. They can be restored later.
          </p>
        </div>
        <button onClick={onDismiss} disabled={dismissing} style={dangerButtonStyle}>
          {dismissing ? "Dismissing…" : "Dismiss"}
        </button>
      </div>
    </aside>
  );
}

function summarizeForBubble(content: string): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, "code snippet")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Writing it up…";
  return cleaned.length > 86 ? `${cleaned.slice(0, 83)}…` : cleaned;
}

export function RoomScene({
  agent,
  roomImage,
  children,
}: {
  agent: Agent;
  roomImage?: string;
  children?: ReactNode;
}) {
  const theme = themeForAgent(agent);
  return (
    <div
      className="pixel-room"
      style={
        {
          position: "relative",
          height: 420,
          overflow: "hidden",
          backgroundColor: theme.wall,
          "--accent": theme.accent,
          "--bed": theme.bed,
        } as CSSProperties
      }
    >
      {roomImage && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(rgba(8,8,20,0.12), rgba(8,8,20,0.34)), url(${roomImage}) center / cover`,
          }}
        />
      )}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.08)" }} />
      <div className="absolute inset-x-0 bottom-0 h-[40%]" style={{ background: theme.floor }} />
      <div className="pixel-bed" />
      <div className="pixel-desk" />
      <div className="pixel-monitor" />
      <div className="pixel-shelf" />
      <div className="absolute right-[10%] top-[14%] h-[18%] w-[20%] border border-white/10 bg-black/25 p-1">
        <div className="mb-1 h-1 bg-[var(--accent)] opacity-75" />
        <div className="mb-1 h-1 w-2/3 bg-[var(--accent)] opacity-50" />
        <div className="font-mono text-[7px] uppercase leading-none text-white/45">{theme.prop}</div>
      </div>
      <div className="pixel-door bottom-0 left-1/2 -translate-x-1/2" />
      <div className="absolute left-2 top-2 z-10 rounded bg-black/45 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-100">
        {agent.name}
      </div>
      <div className="absolute right-2 top-2 z-10 rounded border border-white/10 bg-black/35 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider" style={{ color: theme.accent }}>
        {agent.state}
      </div>
      {children}
    </div>
  );
}

const roomZzzStyle: CSSProperties = {
  position: "absolute",
  left: "54%",
  top: "34%",
  zIndex: 10,
  color: "rgba(255,255,255,0.78)",
  fontFamily: "monospace",
  fontSize: 18,
  animation: "agent-zzz-float 1.8s ease-in-out infinite",
};

const dangerZoneStyle: CSSProperties = {
  marginTop: 16,
  padding: 12,
  border: "1px solid rgba(240,108,108,0.32)",
  borderRadius: 14,
  background: "rgba(240,108,108,0.08)",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};

const dangerButtonStyle: CSSProperties = {
  padding: "9px 12px",
  border: "1px solid rgba(240,108,108,0.5)",
  borderRadius: 10,
  background: "rgba(240,108,108,0.16)",
  color: "#ffd6d6",
  cursor: "pointer",
  fontWeight: 800,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 8,
  color: "#f0f0ff",
  fontSize: 13,
  fontWeight: 700,
};

const ghostButtonStyle: CSSProperties = {
  padding: "9px 12px",
  border: "1px solid #3a3d66",
  borderRadius: 10,
  background: "rgba(255,255,255,0.04)",
  color: "#d9daf2",
  cursor: "pointer",
};
