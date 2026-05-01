import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Application } from "pixi.js";
import { PixiSpriteActor } from "../modules/sprite-engine";
import type { Agent } from "../types";
import { useTerrariumStore } from "./store";
import {
  type RoomCustomization,
  useRoomCustomization,
} from "./room-customization";
import { ChatPanel } from "./ChatPanel";
import { themeForAgent } from "./office-theme";

export function AgentRoom({ agent, ws }: { agent: Agent; ws: React.MutableRefObject<WebSocket | null> }) {
  const setRoute = useTerrariumStore((s) => s.setRoute);
  const [room, setRoom] = useRoomCustomization(agent.id);
  const streaming = useTerrariumStore((s) => s.streamingMessages.get(agent.id));
  const isChatLoading = useTerrariumStore((s) => s.chatLoading.has(agent.id));
  const theme = themeForAgent(agent);
  const [chatOpen, setChatOpen] = useState(false);
  const visualState = useMemo(() => {
    if (streaming) return "working";
    if (isChatLoading) return "thinking";
    return agent.state;
  }, [agent.state, isChatLoading, streaming]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const actorRef = useRef<PixiSpriteActor | null>(null);

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
      actorRef.current?.destroy();
      actorRef.current = null;
      appRef.current?.destroy(true, { children: true });
      appRef.current = null;
    };
  }, [agent.spriteId]);

  useEffect(() => {
    actorRef.current?.setState(visualState);
  }, [visualState]);

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
          gridTemplateColumns: chatOpen
            ? "minmax(460px, 0.95fr) minmax(560px, 1.25fr)"
            : "minmax(520px, 1fr) minmax(280px, 360px)",
          gap: chatOpen ? 24 : 20,
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
              boxShadow: `0 24px 80px ${theme.accent}33`,
              position: "relative",
            }}
          >
            <RoomScene agent={agent} roomImage={room.imageDataUrl}>
              <div ref={canvasRef} style={{ position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none" }} />
              {bubbleText && <SpeechBubble text={bubbleText} />}
            </RoomScene>
          </section>

          <RoomSettingsCard
            agent={agent}
            room={room}
            setRoom={setRoom}
            uploadImage={uploadImage}
          />
        </div>

        {chatOpen ? (
          <div style={chatPanelWrapStyle}>
            <button
              onClick={() => setChatOpen(false)}
              style={closeChatButtonStyle}
              aria-label="Close chat panel"
            >
              Close chat
            </button>
            <ChatPanel agent={agent} ws={ws} />
          </div>
        ) : (
          <TalkCard agent={agent} onOpen={() => setChatOpen(true)} />
        )}
      </div>
    </div>
  );
}

function TalkCard({ agent, onOpen }: { agent: Agent; onOpen: () => void }) {
  const theme = themeForAgent(agent);
  return (
    <aside style={talkCardStyle}>
      <div style={{ fontSize: 38, marginBottom: 12 }}>💬</div>
      <h2 style={{ margin: "0 0 8px", fontSize: 24 }}>Talk with {agent.name}</h2>
      <p style={{ margin: "0 0 20px", color: "#aeb0ce", lineHeight: 1.6 }}>
        Open a right-side chat panel for streamed replies, markdown, code blocks, and session history.
      </p>
      <button
        onClick={onOpen}
        style={{ ...talkButtonStyle, background: theme.accent }}
        aria-label={`Talk with ${agent.name}`}
      >
        Talk
      </button>
    </aside>
  );
}

function RoomSettingsCard({
  agent,
  room,
  setRoom,
  uploadImage,
}: {
  agent: Agent;
  room: RoomCustomization;
  setRoom: (next: RoomCustomization) => void;
  uploadImage: (file: File | undefined) => void;
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
    </aside>
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

const talkCardStyle: CSSProperties = {
  minHeight: 320,
  border: "1px solid #2f3159",
  borderRadius: 24,
  padding: 24,
  background: "linear-gradient(180deg, rgba(12, 15, 36, 0.88), rgba(7, 9, 22, 0.88))",
  boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
  alignSelf: "start",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
};

const talkButtonStyle: CSSProperties = {
  width: "100%",
  maxWidth: 220,
  padding: "14px 18px",
  border: "none",
  borderRadius: 16,
  color: "#050812",
  fontSize: 16,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 12px 34px rgba(0,0,0,0.32)",
};

const chatPanelWrapStyle: CSSProperties = {
  position: "relative",
  animation: "chat-panel-in 180ms ease-out",
};

const closeChatButtonStyle: CSSProperties = {
  position: "absolute",
  right: 14,
  top: 14,
  zIndex: 3,
  padding: "7px 10px",
  border: "1px solid #39406a",
  borderRadius: 10,
  background: "rgba(255,255,255,0.05)",
  color: "#cbd0f0",
  cursor: "pointer",
  fontSize: 12,
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
