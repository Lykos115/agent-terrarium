import { useEffect, useRef, useState } from "react";
import type { Agent } from "../types";

export type OfficeLocation = "home" | "commons";
export type AgentVisualPhase =
  | "home"
  | "homeToDoor"
  | "commonsEnter"
  | "commons"
  | "commonsToDoor"
  | "homeEnter";

interface AgentVisualLocation {
  location: OfficeLocation;
  phase: AgentVisualPhase;
}

type LocationMap = Map<string, AgentVisualLocation>;

const DECISION_INTERVAL_MS = 12_000;
const EXIT_DURATION_MS = 850;
const ENTER_DURATION_MS = 700;

function isPinned(agent: Agent): boolean {
  return agent.state === "working" || agent.state === "sleeping";
}

function isMobile(agent: Agent): boolean {
  return agent.state === "idle" || agent.state === "thinking";
}

function defaultLocationFor(agent: Agent): AgentVisualLocation {
  return isPinned(agent)
    ? { location: "home", phase: "home" }
    : { location: "home", phase: "home" };
}

export function useAgentOfficeLocations(agents: Agent[]): LocationMap {
  const [locations, setLocations] = useState<LocationMap>(() => {
    const initial = new Map<string, AgentVisualLocation>();
    for (const agent of agents) initial.set(agent.id, defaultLocationFor(agent));
    return initial;
  });

  const timeoutRefs = useRef<number[]>([]);

  useEffect(() => {
    setLocations((current) => {
      const next = new Map<string, AgentVisualLocation>();
      const agentIds = new Set(agents.map((agent) => agent.id));

      for (const agent of agents) {
        const existing = current.get(agent.id) ?? defaultLocationFor(agent);
        if (isPinned(agent)) {
          next.set(agent.id, { location: "home", phase: "home" });
        } else {
          next.set(agent.id, existing);
        }
      }

      for (const id of current.keys()) {
        if (!agentIds.has(id)) next.delete(id);
      }

      return next;
    });
  }, [agents]);

  useEffect(() => {
    const clearScheduled = () => {
      for (const timeout of timeoutRefs.current) window.clearTimeout(timeout);
      timeoutRefs.current = [];
    };

    const schedule = (callback: () => void, delay: number) => {
      const timeout = window.setTimeout(callback, delay);
      timeoutRefs.current.push(timeout);
    };

    const moveAgent = (agent: Agent) => {
      setLocations((current) => {
        const existing = current.get(agent.id) ?? defaultLocationFor(agent);
        if (existing.phase !== "home" && existing.phase !== "commons") return current;

        const next = new Map(current);
        if (existing.location === "home") {
          next.set(agent.id, { location: "home", phase: "homeToDoor" });
          schedule(() => {
            setLocations((duringExit) => {
              const moved = new Map(duringExit);
              moved.set(agent.id, { location: "commons", phase: "commonsEnter" });
              return moved;
            });
          }, EXIT_DURATION_MS);
          schedule(() => {
            setLocations((duringEnter) => {
              const settled = new Map(duringEnter);
              settled.set(agent.id, { location: "commons", phase: "commons" });
              return settled;
            });
          }, EXIT_DURATION_MS + ENTER_DURATION_MS);
        } else {
          next.set(agent.id, { location: "commons", phase: "commonsToDoor" });
          schedule(() => {
            setLocations((duringExit) => {
              const moved = new Map(duringExit);
              moved.set(agent.id, { location: "home", phase: "homeEnter" });
              return moved;
            });
          }, EXIT_DURATION_MS);
          schedule(() => {
            setLocations((duringEnter) => {
              const settled = new Map(duringEnter);
              settled.set(agent.id, { location: "home", phase: "home" });
              return settled;
            });
          }, EXIT_DURATION_MS + ENTER_DURATION_MS);
        }
        return next;
      });
    };

    const interval = window.setInterval(() => {
      const eligible = agents.filter(isMobile);
      if (eligible.length === 0) return;

      const movingAgent = eligible[Math.floor(Math.random() * eligible.length)];
      moveAgent(movingAgent);
    }, DECISION_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      clearScheduled();
    };
  }, [agents]);

  return locations;
}
