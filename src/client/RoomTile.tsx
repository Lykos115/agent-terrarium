import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { Application } from "pixi.js";
import type { Agent } from "../types";
import { PixiSpriteActor, type SpriteState } from "../modules/sprite-engine";
import type { AgentVisualPhase } from "./useAgentOfficeLocations";
import { agentColor, themeForAgent } from "./office-theme";
import { AgentSpeechBubble } from "./AgentSpeechBubble";

export type RoomTileVariant = "home" | "commons" | "empty";

interface RoomTileProps {
  agent?: Agent;
  variant?: RoomTileVariant;
  selected?: boolean;
  occupant?: Agent | null;
  occupants?: Agent[];
  slotLabel?: string;
  phase?: AgentVisualPhase;
  onSelect?: () => void;
  /** Navigate into the room view (double-click). */
  onEnter?: () => void;
}

export function RoomTile({
  agent,
  occupant,
  occupants,
  variant = agent ? "home" : "empty",
  selected = false,
  slotLabel,
  phase = "home",
  onSelect,
  onEnter,
}: RoomTileProps) {
  if (variant === "commons") {
    return <CommandCommons occupants={occupants ?? (occupant ? [occupant] : [])} selected={selected} onSelect={onSelect} />;
  }

  if (!agent) {
    return <EmptyRoom slotLabel={slotLabel} selected={selected} onSelect={onSelect} />;
  }

  const theme = themeForAgent(agent);
  const visibleAgent = occupant === undefined ? agent : occupant;
  const isPinned = agent.state === "working" || agent.state === "sleeping";
  const agentPosition =
    phase === "homeToDoor"
      ? "left-1/2 bottom-[5%] -translate-x-1/2 opacity-35 scale-90"
      : phase === "homeEnter"
        ? "left-1/2 bottom-[5%] -translate-x-1/2 opacity-70 scale-95"
        : agent.state === "sleeping"
          ? "left-[18%] top-[22%]"
          : isPinned
            ? "right-[23%] bottom-[29%]"
            : "left-[45%] bottom-[20%]";

  return (
    <button
      type="button"
      onClick={() => {
        onSelect?.();
        onEnter?.();
      }}
      className={`pixel-room group relative aspect-[4/3] h-full w-full overflow-hidden rounded border text-left shadow-room transition hover:-translate-y-0.5 ${
        selected ? "border-cyanLive ring-2 ring-cyanLive/30" : "border-slate-700/80"
      }`}
      style={
        {
          backgroundColor: theme.wall,
          "--accent": theme.accent,
          "--bed": theme.bed,
        } as CSSProperties
      }
    >
      <div className="absolute inset-x-0 bottom-0 h-[40%]" style={{ background: theme.floor }} />
      <div className="pixel-bed" />
      <div className="pixel-desk" />
      <div className="pixel-monitor" />
      <div className="pixel-shelf" />
      <SpecialtyProp prop={theme.prop} />
      <Door />

      <div className="absolute left-2 top-2 rounded bg-black/45 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-100">
        {agent.name}
      </div>
      <div className="absolute right-2 top-2 rounded border border-white/10 bg-black/35 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider" style={{ color: theme.accent }}>
        {agent.state}
      </div>

      {visibleAgent && (
        <div className={`absolute transition-all duration-700 ease-in-out ${agentPosition}`}>
          <AgentSpeechBubble agent={visibleAgent} scale="grid" />
          <PixiAgentCanvas agent={visibleAgent} size={76} />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-black/45 px-2 py-1.5 text-[10px] text-slate-300 opacity-0 transition group-hover:opacity-100">
        {theme.name}
      </div>
    </button>
  );
}

export function PixelAgent({ agent, sleeping = false }: { agent: Agent; sleeping?: boolean }) {
  return (
    <div className="relative">
      <div
        className={`pixel-agent ${sleeping ? "opacity-55" : ""}`}
        style={{ "--agent": agentColor(agent) } as CSSProperties}
        title={agent.name}
      />
      {sleeping && <div className="absolute -right-3 -top-5 font-mono text-xs text-white/80">Z</div>}
    </div>
  );
}

function PixiAgentCanvas({ agent, size = 64 }: { agent: Agent; size?: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const actorRef = useRef<PixiSpriteActor | null>(null);

  useEffect(() => {
    let cancelled = false;
    let app: Application | null = null;
    let actor: PixiSpriteActor | null = null;

    async function mount() {
      if (!hostRef.current) return;
      app = new Application();
      await app.init({
        width: size,
        height: size,
        backgroundAlpha: 0,
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      if (cancelled || !hostRef.current) {
        app.destroy(true);
        return;
      }

      hostRef.current.replaceChildren(app.canvas);
      actor = new PixiSpriteActor(app, agent.spriteId, Math.max(18, size / 3));
      actor.setState(agent.state as SpriteState);
      actor.setPosition(size / 2, size / 2 + size * 0.08);
      app.stage.addChild(actor.getContainer());
      actorRef.current = actor;
    }

    void mount();

    return () => {
      cancelled = true;
      actorRef.current = null;
      actor?.destroy();
      app?.destroy(true);
    };
  }, [agent.id, agent.spriteId, size]);

  useEffect(() => {
    actorRef.current?.setState(agent.state as SpriteState);
  }, [agent.state]);

  return (
    <div
      ref={hostRef}
      className="pointer-events-none pixelated drop-shadow-[0_0_12px_var(--agent)]"
      style={{ width: size, height: size, "--agent": agentColor(agent) } as CSSProperties}
      aria-label={`${agent.name} ${agent.state} sprite`}
    />
  );
}

function CommandCommons({ occupants, selected, onSelect }: { occupants: Agent[]; selected?: boolean; onSelect?: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`pixel-room relative aspect-[4/3] h-full w-full overflow-hidden rounded border bg-[#10142a] text-left shadow-room transition hover:-translate-y-0.5 ${
        selected ? "border-cyanLive ring-2 ring-cyanLive/30" : "border-cyanLive/30"
      }`}
      style={{ "--accent": "#73ffd8" } as CSSProperties}
    >
      <div className="absolute inset-x-0 bottom-0 h-[42%] bg-[#161331]" />
      <div className="absolute left-[14%] top-[13%] h-[22%] w-[72%] border-2 border-cyanLive/40 bg-black/35 shadow-glow">
        <div className="m-2 h-1.5 w-2/3 bg-cyanLive/70" />
        <div className="mx-2 mt-2 h-1.5 w-1/2 bg-purple-300/60" />
      </div>
      <div className="absolute left-[28%] bottom-[22%] h-[17%] w-[44%] rounded-sm bg-[#493f72] shadow-inner" />
      <div className="absolute left-2 top-2 rounded bg-black/50 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-cyanLive">
        Command Commons
      </div>
      <div className="absolute bottom-[30%] left-[28%] flex gap-3">
        {occupants.map((agent) => (
          <PixiAgentCanvas key={agent.id} agent={agent} size={52} />
        ))}
      </div>
    </button>
  );
}

function EmptyRoom({ slotLabel, selected, onSelect }: { slotLabel?: string; selected?: boolean; onSelect?: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`pixel-room relative aspect-[4/3] h-full w-full overflow-hidden rounded border bg-[#0b1020] text-left text-slate-500 transition hover:border-slate-500 ${
        selected ? "border-cyanLive ring-2 ring-cyanLive/30" : "border-slate-800"
      }`}
    >
      <div className="absolute inset-x-0 bottom-0 h-[38%] bg-[#0d1326]" />
      <div className="absolute left-3 top-3 font-mono text-[10px] uppercase tracking-[0.18em]">{slotLabel ?? "Vacant Room"}</div>
      <div className="absolute inset-0 grid place-items-center font-mono text-xs uppercase tracking-[0.18em]">Awaiting Agent</div>
    </button>
  );
}

function Door() {
  return <div className="pixel-door bottom-0 left-1/2 -translate-x-1/2" />;
}

function SpecialtyProp({ prop }: { prop: string }) {
  return (
    <div className="absolute right-[10%] top-[14%] h-[18%] w-[20%] border border-white/10 bg-black/25 p-1">
      <div className="mb-1 h-1 bg-[var(--accent)] opacity-75" />
      <div className="mb-1 h-1 w-2/3 bg-[var(--accent)] opacity-50" />
      <div className="font-mono text-[7px] uppercase leading-none text-white/45">{prop}</div>
    </div>
  );
}
