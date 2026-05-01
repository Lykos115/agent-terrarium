import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Application } from "pixi.js";
import { PixiRoom, PixiSpriteActor } from "../modules/sprite-engine";
import type { Agent } from "../types";
import { requestArchiveAgent, useTerrariumStore } from "./store";
import {
  ROOM_LOOKS,
  type RoomCustomization,
  type RoomLook,
  useRoomCustomization,
} from "./room-customization";
import { ChatPanel } from "./ChatPanel";

export function AgentRoom({ agent, ws }: { agent: Agent; ws: React.MutableRefObject<WebSocket | null> }) {
  const setRoute = useTerrariumStore((s) => s.setRoute);
  const [room, setRoom] = useRoomCustomization(agent.id);
  const streaming = useTerrariumStore((s) => s.streamingMessages.get(agent.id));
  const isChatLoading = useTerrariumStore((s) => s.chatLoading.has(agent.id));
  const look = ROOM_LOOKS[room.look];
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const roomRef = useRef<PixiRoom | null>(null);
  const actorRef = useRef<PixiSpriteActor | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    let app: Application;
    let pixiRoom: PixiRoom;
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

      pixiRoom = new PixiRoom(app);
      pixiRoom.setBackground(0x000000);
      pixiRoom.getContainer().alpha = 0;
      roomRef.current = pixiRoom;

      actor = new PixiSpriteActor(app, agent.spriteId, 42);
      actorRef.current = actor;
      pixiRoom.addActor(actor, 260, 245);
      actor.setState(agent.state);
    })();

    return () => {
      actorRef.current?.destroy();
      actorRef.current = null;
      roomRef.current?.destroy();
      roomRef.current = null;
      appRef.current?.destroy(true, { children: true });
      appRef.current = null;
    };
  }, [agent.spriteId]);

  useEffect(() => {
    actorRef.current?.setState(agent.state);
  }, [agent.state]);

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

  const bubbleText = streaming?.content
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
            style={{
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 24,
              overflow: "hidden",
              background: "#111123",
              boxShadow: `0 24px 80px ${look.glow}`,
              position: "relative",
            }}
          >
            <RoomScene agent={agent} roomImage={room.imageDataUrl} look={room.look}>
              <div ref={canvasRef} style={{ position: "absolute", inset: 0, zIndex: 5 }} />
              <DeskTerminal active={Boolean(isChatLoading || streaming)} accent={look.accent} />
              {bubbleText && <SpeechBubble text={bubbleText} />}
            </RoomScene>
          </section>

          <RoomSettingsCard
            agent={agent}
            room={room}
            setRoom={setRoom}
            uploadImage={uploadImage}
            ws={ws}
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
  ws,
}: {
  agent: Agent;
  room: RoomCustomization;
  setRoom: (next: RoomCustomization) => void;
  uploadImage: (file: File | undefined) => void;
  ws: React.MutableRefObject<WebSocket | null>;
}) {
  const dismissAgent = () => {
    const confirmed = window.confirm(
      `Dismiss ${agent.name}? They will be archived and can be restored from the summoning wizard.`,
    );
    if (confirmed && ws.current) {
      requestArchiveAgent(ws.current, agent.id);
    }
  };
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

      <label style={labelStyle}>Room look</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginBottom: 14 }}>
        {(Object.keys(ROOM_LOOKS) as RoomLook[]).map((key) => (
          <button
            key={key}
            onClick={() => setRoom({ ...room, look: key })}
            style={{
              ...choiceButtonStyle,
              borderColor: room.look === key ? ROOM_LOOKS[key].accent : "#36385f",
              color: room.look === key ? "#fff" : "#b9bad2",
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 5,
                background: ROOM_LOOKS[key].wallpaper,
                border: `1px solid ${ROOM_LOOKS[key].accent}`,
              }}
            />
            {ROOM_LOOKS[key].label}
          </button>
        ))}
      </div>

      <label style={labelStyle}>Backdrop image</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => uploadImage(event.currentTarget.files?.[0])}
          style={{ color: "#cfd0e8", maxWidth: 260 }}
        />
        {room.imageDataUrl && (
          <button
            onClick={() => setRoom({ ...room, imageDataUrl: undefined })}
            style={ghostButtonStyle}
          >
            Remove image
          </button>
        )}
      </div>

      <div
        style={{
          marginTop: 16,
          paddingTop: 14,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div style={{ color: "#ffb8b8", fontSize: 12, fontWeight: 700 }}>Dismiss agent</div>
          <div style={{ color: "#8f91ad", fontSize: 11 }}>Archives, does not delete.</div>
        </div>
        <button
          onClick={dismissAgent}
          disabled={!ws.current}
          style={{
            padding: "8px 11px",
            border: "1px solid rgba(240, 108, 108, 0.5)",
            borderRadius: 9,
            background: "rgba(240, 108, 108, 0.1)",
            color: "#ffb8b8",
            cursor: ws.current ? "pointer" : "not-allowed",
            opacity: ws.current ? 1 : 0.45,
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          Dismiss
        </button>
      </div>
    </aside>
  );
}

function DeskTerminal({ active, accent }: { active: boolean; accent: string }) {
  return (
    <div
      style={{
        position: "absolute",
        right: "16%",
        bottom: "30%",
        zIndex: 7,
        width: 96,
        height: 58,
        borderRadius: 10,
        border: `2px solid ${accent}`,
        background: "linear-gradient(180deg, #07121d, #040713)",
        boxShadow: active ? `0 0 28px ${accent}` : `0 0 12px ${accent}66`,
        opacity: 0.92,
      }}
    >
      <div style={{ margin: "10px auto 0", width: "72%", height: 4, background: accent, opacity: 0.85 }} />
      <div style={{ margin: "8px auto 0", width: "46%", height: 4, background: accent, opacity: active ? 1 : 0.45 }} />
    </div>
  );
}

function SpeechBubble({ text }: { text: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: "38%",
        top: "21%",
        zIndex: 9,
        maxWidth: 250,
        padding: "10px 13px",
        borderRadius: "16px 16px 16px 4px",
        border: "1px solid rgba(255,255,255,0.22)",
        background: "rgba(8, 10, 24, 0.86)",
        color: "#f4f6ff",
        fontSize: 12,
        lineHeight: 1.45,
        boxShadow: "0 14px 38px rgba(0,0,0,0.38)",
        backdropFilter: "blur(8px)",
      }}
    >
      {text}
    </div>
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
  look: lookKey,
  children,
}: {
  agent: Agent;
  roomImage?: string;
  look: RoomLook;
  children?: ReactNode;
}) {
  const look = ROOM_LOOKS[lookKey];
  return (
    <div style={{ position: "relative", height: 420, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: roomImage
            ? `linear-gradient(rgba(8,8,20,0.12), rgba(8,8,20,0.34)), url(${roomImage}) center / cover`
            : look.wallpaper,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "8%",
          right: "8%",
          top: "12%",
          height: "48%",
          border: `2px solid ${look.accent}`,
          borderRadius: 18,
          opacity: 0.35,
          boxShadow: `0 0 40px ${look.glow}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "-8%",
          right: "-8%",
          bottom: "-18%",
          height: "45%",
          background: look.floor,
          transform: "perspective(480px) rotateX(58deg)",
          transformOrigin: "top center",
          borderTop: `3px solid ${look.accent}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 24,
          top: 20,
          padding: "7px 11px",
          borderRadius: 999,
          background: "rgba(0,0,0,0.38)",
          color: "#f5f5ff",
          fontSize: 12,
          letterSpacing: 0.4,
          zIndex: 8,
        }}
      >
        {agent.name}'s room
      </div>
      {children}
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 8,
  color: "#f0f0ff",
  fontSize: 13,
  fontWeight: 700,
};

const choiceButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid #36385f",
  borderRadius: 10,
  cursor: "pointer",
  textAlign: "left",
};

const ghostButtonStyle: CSSProperties = {
  padding: "9px 12px",
  border: "1px solid #3a3d66",
  borderRadius: 10,
  background: "rgba(255,255,255,0.04)",
  color: "#d9daf2",
  cursor: "pointer",
};
