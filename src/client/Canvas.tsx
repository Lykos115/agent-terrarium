import { useEffect, useRef } from "react";
import { Application, Graphics, Text } from "pixi.js";

/** PixiJS canvas — renders a colored rectangle to prove the sprite engine is wired. */
export default function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clean up any leftover canvas from Strict Mode remount
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    let cancelled = false;
    const app = new Application();
    appRef.current = app;

    app.init({
      width: 800,
      height: 600,
      background: 0x1a1a2e,
      antialias: true,
    }).then(() => {
      if (cancelled) {
        app.destroy(true);
        return;
      }

      container.appendChild(app.canvas);

      // Outer border rectangle
      const rect = new Graphics();
      rect.rect(150, 100, 500, 400);
      rect.fill({ color: 0x6c63ff, alpha: 1 });
      rect.stroke({ color: 0xffffff, width: 2 });
      app.stage.addChild(rect);

      // Inner room placeholder
      const inner = new Graphics();
      inner.rect(250, 200, 300, 200);
      inner.fill({ color: 0x3a3a6e, alpha: 1 });
      app.stage.addChild(inner);

      // Label
      const label = new Text({
        text: "Agent Terrarium",
        style: { fontSize: 24, fill: 0xffffff },
      });
      label.x = 300;
      label.y = 330;
      app.stage.addChild(label);
    });

    return () => {
      cancelled = true;
      appRef.current = null;

      // Remove canvas from DOM if already appended
      if (app.canvas?.parentNode === container) {
        container.removeChild(app.canvas);
      }

      // Destroy — safe to call even if init hasn't completed
      try { app.destroy(true); } catch { /* init not done yet, .then() handles it */ }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: 800, height: 600, margin: "0 auto" }}
    />
  );
}
