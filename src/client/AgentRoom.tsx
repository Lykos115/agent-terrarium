import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Application } from "pixi.js";
import { PixiRoom, PixiSpriteActor } from "../modules/sprite-engine";
import type { Agent } from "../types";
import { useTerrariumStore } from "./store";
import {
  ROOM_LOOKS,
  type RoomLook,
  useRoomCustomization,
} from "./room-customization";

export function AgentRoom({ agent }: { agent: Agent }) {
  const setRoute = useTerrariumStore((s) => s.setRoute);
  const [room, setRoom] = useRoomCustomization(agent.id);
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

  return (
    <div style={{ padding: 24, maxWidth: 1180, margin: "0 auto", width: "100%" }}>
      <button
        onClick={() => setRoute({ name: "grid" })}
        style={ghostButtonStyle}
      >
        ← All rooms
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(520px, 1fr) 320px",
          gap: 24,
          alignItems: "start",
          marginTop: 18,
        }}
      >
        <section
          style={{
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 24,
            overflow: "hidden",
            background: "#111123",
            boxShadow: `0 24px 80px ${look.glow}`,
          }}
        >
          <RoomScene agent={agent} roomImage={room.imageDataUrl} look={room.look}>
            <div ref={canvasRef} style={{ position: "absolute", inset: 0, zIndex: 5 }} />
          </RoomScene>
        </section>

        <aside
          style={{
            border: "1px solid #2f3159",
            borderRadius: 18,
            padding: 18,
            background: "rgba(10, 10, 25, 0.82)",
          }}
        >
          <h2 style={{ margin: "0 0 4px", fontSize: 22 }}>{agent.name}</h2>
          <p style={{ margin: "0 0 18px", color: "#aeb0ce", fontSize: 13 }}>
            {agent.specialty} · {agent.state}
          </p>

          <label style={labelStyle}>Room look</label>
          <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
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
                    width: 18,
                    height: 18,
                    borderRadius: 6,
                    background: ROOM_LOOKS[key].wallpaper,
                    border: `1px solid ${ROOM_LOOKS[key].accent}`,
                  }}
                />
                {ROOM_LOOKS[key].label}
              </button>
            ))}
          </div>

          <label style={labelStyle}>Backdrop image</label>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => uploadImage(event.currentTarget.files?.[0])}
            style={{ width: "100%", color: "#cfd0e8", marginBottom: 12 }}
          />
          {room.imageDataUrl && (
            <button
              onClick={() => setRoom({ ...room, imageDataUrl: undefined })}
              style={ghostButtonStyle}
            >
              Remove uploaded image
            </button>
          )}
        </aside>
      </div>
    </div>
  );
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
