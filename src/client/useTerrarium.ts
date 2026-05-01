import { useEffect, useRef } from "react";
import { useTerrariumStore } from "./store";
import type { ServerMessage } from "../types";

/**
 * Hook that owns the single WebSocket connection for the app.
 *
 * Responsibilities:
 * - Open a WS to /ws on mount
 * - Feed incoming messages to the Zustand store via applyServerMessage
 * - Maintain `connection` status ("connecting" | "open" | "closed")
 * - Auto-reconnect with capped exponential backoff on close
 *
 * Call this ONCE at the top of the app (e.g. in `<App />`). Components that
 * need the connection itself can read it from the ref returned here; most
 * components only need store state and use `useTerrariumStore` directly.
 */
export function useTerrarium(): { ws: React.MutableRefObject<WebSocket | null> } {
  const wsRef = useRef<WebSocket | null>(null);
  const setConnection = useTerrariumStore((s) => s.setConnection);
  const applyServerMessage = useTerrariumStore((s) => s.applyServerMessage);

  useEffect(() => {
    let closedByUnmount = false;
    let reconnectDelayMs = 500;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${protocol}://${window.location.host}/ws`;
      setConnection("connecting");

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        setConnection("open");
        reconnectDelayMs = 500; // reset backoff after a successful connection
      });

      ws.addEventListener("message", (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as ServerMessage;
          applyServerMessage(msg);
        } catch (err) {
          console.error("[useTerrarium] bad message", err);
        }
      });

      ws.addEventListener("close", () => {
        wsRef.current = null;
        setConnection("closed");
        if (closedByUnmount) return;
        // Exponential backoff, capped at 10s
        reconnectTimer = setTimeout(connect, reconnectDelayMs);
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, 10_000);
      });

      ws.addEventListener("error", () => {
        // `close` fires after `error`; reconnect logic lives there.
      });
    };

    connect();

    return () => {
      closedByUnmount = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [setConnection, applyServerMessage]);

  return { ws: wsRef };
}
