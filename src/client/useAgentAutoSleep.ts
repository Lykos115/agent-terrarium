import { useEffect, useRef } from "react";
import type { Agent } from "../types";
import { requestUpdateAgent } from "./store";

export const AUTO_SLEEP_AFTER_MS = 30_000;

export function useAgentAutoSleep(
  agents: Map<string, Agent>,
  ws: React.MutableRefObject<WebSocket | null>,
) {
  const timersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    const activeIds = new Set(agents.keys());

    for (const [agentId, timer] of timers) {
      if (!activeIds.has(agentId) || agents.get(agentId)?.state !== "idle") {
        window.clearTimeout(timer);
        timers.delete(agentId);
      }
    }

    for (const agent of agents.values()) {
      if (agent.state !== "idle" || timers.has(agent.id)) continue;
      const timer = window.setTimeout(() => {
        timers.delete(agent.id);
        if (!ws.current) return;
        requestUpdateAgent(ws.current, agent.id, {
          state: "sleeping",
          statusText: "Zzz…",
        });
      }, AUTO_SLEEP_AFTER_MS);
      timers.set(agent.id, timer);
    }

    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, [agents, ws]);
}

export function wakeAgent(agent: Agent, ws: React.MutableRefObject<WebSocket | null>) {
  if (agent.state !== "sleeping" || !ws.current) return false;
  requestUpdateAgent(ws.current, agent.id, {
    state: "idle",
    statusText: "Awake and ready.",
  });
  return true;
}
