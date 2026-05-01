import { useMemo, useState } from "react";
import type { Agent } from "../types";
import { themeForAgent } from "./office-theme";
import { RoomTile, PixelAgent } from "./RoomTile";
import { useTerrariumStore } from "./store";
import { useAgentOfficeLocations } from "./useAgentOfficeLocations";

type Selection =
  | { type: "overview" }
  | { type: "commons" }
  | { type: "room"; slot: number; agent?: Agent };

const ROOM_SLOTS = [0, 1, 2, 3, 5, 6, 7, 8];

/** Mission-control 3x3 office floorplan. */
export function DollhouseGrid() {
  const agents = useTerrariumStore((s) => s.agentList);
  const setWizardOpen = useTerrariumStore((s) => s.setWizardOpen);
  const setRoute = useTerrariumStore((s) => s.setRoute);
  const connection = useTerrariumStore((s) => s.connection);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [selection, setSelection] = useState<Selection>({ type: "overview" });
  const officeLocations = useAgentOfficeLocations(agents);

  const slotAgents = useMemo(() => {
    const bySlot = new Map<number, Agent>();
    agents.slice(0, ROOM_SLOTS.length).forEach((agent, index) => {
      bySlot.set(ROOM_SLOTS[index], agent);
    });
    return bySlot;
  }, [agents]);

  const commonsAgents = agents.filter(
    (agent) => officeLocations.get(agent.id)?.location === "commons",
  );

  return (
    <div className="min-h-screen bg-void text-slate-100 lg:grid lg:grid-cols-[240px_minmax(0,1fr)_320px]">
      <MissionSidebar
        connection={connection}
        agentCount={agents.length}
        onSummon={() => setWizardOpen(true)}
      />

      <main className="min-w-0 px-5 py-7 lg:px-9">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="m-0 text-3xl font-black tracking-tight">🗺️ Agent Office</h2>
            <p className="mt-1 text-sm text-slate-400">
              Personal rooms orbit the Command Commons. Idle agents can gather; working and sleeping agents stay home.
            </p>
          </div>
          <LiveBadge connection={connection} />
        </div>

        <section className="rounded-lg border border-gridline bg-gradient-to-b from-[#0a0e1d] to-[#04060f] p-4 shadow-room">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:gap-4">
            {Array.from({ length: 9 }, (_, slot) => {
              if (slot === 4) {
                return (
                  <RoomTile
                    key="commons"
                    variant="commons"
                    occupants={commonsAgents}
                    selected={selection.type === "commons"}
                    onSelect={() => setSelection({ type: "commons" })}
                  />
                );
              }

              const agent = slotAgents.get(slot);
              const visual = agent ? officeLocations.get(agent.id) : undefined;
              const isInCommons = visual?.location === "commons";
              return (
                <RoomTile
                  key={slot}
                  agent={agent}
                  occupant={isInCommons ? null : agent}
                  phase={visual?.phase}
                  slotLabel={`Room ${slot + 1}`}
                  selected={selection.type === "room" && selection.slot === slot}
                  onSelect={() => setSelection({ type: "room", slot, agent })}
                  onEnter={agent ? () => setRoute({ name: "room", agentId: agent.id }) : undefined}
                />
              );
            })}
          </div>

          <StatusTicker agents={agents} />
        </section>

        <button
          onClick={() => setWizardOpen(true)}
          className="mt-4 rounded border border-dashed border-blue-400/45 bg-blue-400/5 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-blue-200 transition hover:border-cyanLive hover:text-cyanLive"
        >
          + Summon Agent
        </button>
      </main>

      <Inspector
        open={inspectorOpen}
        selection={selection}
        agents={agents}
        onToggle={() => setInspectorOpen((open) => !open)}
        onEnterRoom={(agentId) => setRoute({ name: "room", agentId })}
      />
    </div>
  );
}

function MissionSidebar({
  connection,
  agentCount,
  onSummon,
}: {
  connection: "connecting" | "open" | "closed";
  agentCount: number;
  onSummon: () => void;
}) {
  const nav = ["🎯 Tasks", "🛰️ Content", "📅 Calendar", "🚀 Projects", "🧠 Memory", "📄 Docs", "👥 Team"];
  return (
    <aside className="border-b border-gridline bg-gradient-to-b from-[#091122] to-[#060b16] lg:border-b-0 lg:border-r">
      <div className="px-5 py-8 text-center">
        <div className="text-4xl drop-shadow-[0_0_12px_#ff6f9c]">🐙</div>
        <button
          onClick={onSummon}
          className="mt-6 w-full rounded-md border border-[#4d6195] bg-[#141e3a]/70 px-3 py-4 font-black leading-snug tracking-[0.32em] text-white transition hover:border-cyanLive hover:shadow-glow"
        >
          MISSION<br />CONTROL
        </button>
        <div className={`mt-4 font-bold tracking-wider ${connection === "open" ? "text-cyanLive" : "text-amber-300"}`}>
          ● {agentCount ? `${agentCount} AGENTS` : "EMPTY"}
        </div>
      </div>

      <nav className="border-t border-gridline px-3 py-5">
        {nav.map((item) => (
          <div key={item} className="flex items-center gap-2 rounded px-3 py-3 font-semibold text-slate-400">
            {item}
          </div>
        ))}
        <div className="mt-3 flex items-center rounded border border-blue-400 px-3 py-3 font-bold text-white shadow-[0_0_18px_rgba(110,140,255,0.22)]">
          🗺️ Visual <span className="ml-auto text-cyanLive">●</span>
        </div>
      </nav>
    </aside>
  );
}

function LiveBadge({ connection }: { connection: "connecting" | "open" | "closed" }) {
  return (
    <div className={`flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] ${connection === "open" ? "text-cyanLive" : "text-amber-300"}`}>
      <span className="h-2 w-2 rounded-full bg-current shadow-[0_0_14px_currentColor]" />
      {connection === "open" ? "Live" : connection}
    </div>
  );
}

function StatusTicker({ agents }: { agents: Agent[] }) {
  const copy = agents.map((a) => `${a.name}: ${a.state.toUpperCase()}`).join("  •  ");
  return (
    <div className="mt-3 overflow-hidden whitespace-nowrap border border-[#1b2445] bg-[#070818] px-3 py-2 font-mono text-xs text-purple-300">
      • LIVE&nbsp;&nbsp; {copy || "no active agents"} &nbsp;&nbsp;• commons open • rooms locked during work/sleep •
    </div>
  );
}

function Inspector({
  open,
  selection,
  agents,
  onToggle,
  onEnterRoom,
}: {
  open: boolean;
  selection: Selection;
  agents: Agent[];
  onToggle: () => void;
  onEnterRoom?: (agentId: string) => void;
}) {
  return (
    <aside className={`${open ? "block" : "hidden lg:block"} border-t border-gridline bg-[#070b16] lg:border-l lg:border-t-0`}>
      <div className="flex items-center justify-between border-b border-gridline px-4 py-3">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-slate-400">Inspector</div>
        <button onClick={onToggle} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300">
          {open ? "Collapse" : "Open"}
        </button>
      </div>
      <div className="space-y-4 p-4">
        {selection.type === "overview" && <OverviewPanel agents={agents} />}
        {selection.type === "commons" && <CommonsPanel agents={agents} />}
        {selection.type === "room" && <RoomPanel slot={selection.slot} agent={selection.agent} onEnterRoom={onEnterRoom} />}
      </div>
    </aside>
  );
}

function OverviewPanel({ agents }: { agents: Agent[] }) {
  return (
    <>
      <h3 className="text-xl font-black">Office Overview</h3>
      <p className="text-sm leading-6 text-slate-400">
        3x3 floorplan: eight personal rooms around a shared Command Commons. Next pass can add the stylized walk-to-door movement.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Agents" value={agents.length} />
        <Metric label="Idle" value={agents.filter((a) => a.state === "idle").length} />
      </div>
    </>
  );
}

function CommonsPanel({ agents }: { agents: Agent[] }) {
  const available = agents.filter((a) => a.state === "idle" || a.state === "thinking");
  return (
    <>
      <h3 className="text-xl font-black text-cyanLive">Command Commons</h3>
      <p className="text-sm leading-6 text-slate-400">Shared gathering space for idle and thinking agents. Working/sleeping agents stay in their rooms.</p>
      <div className="space-y-2">
        {available.map((agent) => (
          <div key={agent.id} className="flex items-center gap-3 rounded border border-slate-800 bg-black/20 p-2">
            <PixelAgent agent={agent} />
            <div>
              <div className="font-bold">{agent.name}</div>
              <div className="text-xs text-slate-500">{agent.state}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function RoomPanel({ slot, agent, onEnterRoom }: { slot: number; agent?: Agent; onEnterRoom?: (agentId: string) => void }) {
  if (!agent) {
    return (
      <>
        <h3 className="text-xl font-black">Vacant Room {slot + 1}</h3>
        <p className="text-sm text-slate-400">This room is ready for a future agent.</p>
      </>
    );
  }
  const theme = themeForAgent(agent);
  return (
    <>
      <div className="flex items-center gap-3">
        <PixelAgent agent={agent} sleeping={agent.state === "sleeping"} />
        <div>
          <h3 className="text-xl font-black">{agent.name}</h3>
          <div className="text-sm text-slate-400">{agent.specialty}</div>
        </div>
      </div>
      <div className="rounded border border-slate-800 bg-black/20 p-3">
        <div className="font-mono text-xs uppercase tracking-[0.18em]" style={{ color: theme.accent }}>{theme.name}</div>
        <p className="mt-2 text-sm leading-6 text-slate-400">{theme.mood}</p>
      </div>
      <Metric label="State" value={agent.state} />
      <Metric label="Model" value={agent.modelTier} />
      <button
        onClick={() => onEnterRoom?.(agent.id)}
        className="w-full rounded border border-blue-400/45 bg-blue-400/5 px-3 py-2 text-sm font-semibold text-blue-200 transition hover:border-cyanLive hover:text-cyanLive"
      >
        💬 Enter Room
      </button>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-slate-800 bg-black/20 p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 font-bold text-slate-100">{value}</div>
    </div>
  );
}
