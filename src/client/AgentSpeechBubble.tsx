import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Agent, AgentState, Specialty } from "../types";

export function AgentSpeechBubble({
  agent,
  text,
  scale = "grid",
  style,
}: {
  agent: Agent;
  /** Optional high-priority text, e.g. streamed chat preview. */
  text?: string;
  scale?: "grid" | "room";
  style?: CSSProperties;
}) {
  const ambientText = useAmbientBubbleText(agent, text);
  if (!ambientText) return null;

  return (
    <div
      className={`agent-speech-bubble agent-speech-bubble--${scale}`}
      style={style}
      role="status"
      aria-live="polite"
    >
      {ambientText}
    </div>
  );
}

function useAmbientBubbleText(agent: Agent, priorityText?: string): string | null {
  const [bubble, setBubble] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const lastSignatureRef = useRef<string>("");

  useEffect(() => {
    const nextText = priorityText?.trim() || initialBubbleFor(agent);
    showBubble(nextText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id]);

  useEffect(() => {
    if (priorityText?.trim()) {
      showBubble(priorityText.trim(), false);
      return;
    }

    const signature = `${agent.state}:${agent.statusText}`;
    if (!lastSignatureRef.current) {
      lastSignatureRef.current = signature;
      return;
    }
    if (signature === lastSignatureRef.current) return;

    lastSignatureRef.current = signature;
    showBubble(agent.statusText?.trim() || stateBubble(agent.name, agent.state));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.name, agent.state, agent.statusText, priorityText]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  function showBubble(text: string, autoHide = true) {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setBubble(text);
    if (autoHide) {
      timeoutRef.current = window.setTimeout(() => setBubble(null), 4_000);
    }
  }

  return bubble;
}

function stateBubble(name: string, state: AgentState): string {
  switch (state) {
    case "thinking":
      return `${name} is thinking…`;
    case "working":
      return `${name} is working through it…`;
    case "sleeping":
      return `${name} is sleeping.`;
    case "idle":
      return `${name} is ready.`;
  }
}

function initialBubbleFor(agent: Agent): string {
  return specialtyBubble(agent.name, agent.specialty);
}

function specialtyBubble(name: string, specialty: Specialty): string {
  switch (specialty) {
    case "Code Reviewer":
      return `${name}: send me a diff to inspect.`;
    case "Spec Griller":
      return `${name}: I have questions ready.`;
    case "General Chat":
      return `${name}: ready when you are.`;
    case "DevOps":
      return `${name}: watching the pipes.`;
    case "Creative Writer":
      return `${name}: ideas are simmering.`;
    case "Researcher":
      return `${name}: sources at the ready.`;
    case "Debugger":
      return `${name}: let's chase the bug.`;
  }
}
