/**
 * Sprite Engine — PixiJS-based rendering layer.
 *
 * Provides real PixiJS-backed implementations of SpriteActor and Room.
 * Each agent gets a programmatic colored blob with bob animation, color-shift,
 * and state-specific overlays (sparkles for thinking, gear for working, Z for sleeping).
 */

import { Application, Container, Graphics, Text } from "pixi.js";

export type SpriteState = "idle" | "thinking" | "working" | "sleeping";

// ---------------------------------------------------------------------------
// Color mapping for sprite IDs
// ---------------------------------------------------------------------------

/**
 * Deterministically map spriteId to a base color (RGB).
 * Known sprites: glitchkin → red, mapsie → teal, blipblop → purple.
 * Fallback: hash the string for unknown sprites.
 */
export function spriteIdToColor(spriteId: string): number {
  const mapping: Record<string, number> = {
    "sprite-glitchkin": 0xff4466, // red-pink
    "sprite-mapsie": 0x44dddd, // teal
    "sprite-blipblop": 0xaa66ff, // purple
  };
  if (spriteId in mapping) return mapping[spriteId];

  // Fallback: simple string hash → hue
  let hash = 0;
  for (let i = 0; i < spriteId.length; i++) {
    hash = (hash << 5) - hash + spriteId.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash % 360);
  return hslToRgb(hue, 70, 60);
}

/**
 * Convert HSL (h: 0–360, s: 0–100, l: 0–100) to RGB hex.
 * Used for color-shift animation and fallback sprite colors.
 */
export function hslToRgb(h: number, s: number, l: number): number {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return (
    (Math.round((r + m) * 255) << 16) |
    (Math.round((g + m) * 255) << 8) |
    Math.round((b + m) * 255)
  );
}

// ---------------------------------------------------------------------------
// Animation timing helpers
// ---------------------------------------------------------------------------

/**
 * Compute bob offset (y-axis) for idle animation.
 * Returns vertical displacement in pixels (±range).
 */
export function computeBobOffset(
  elapsedMs: number,
  period: number,
  range: number,
): number {
  return Math.sin((elapsedMs / period) * Math.PI * 2) * range;
}

/**
 * Compute hue shift for color animation.
 * Returns delta in degrees (±shift).
 */
export function computeHueShift(
  elapsedMs: number,
  period: number,
  shift: number,
): number {
  return Math.sin((elapsedMs / period) * Math.PI * 2) * shift;
}

// ---------------------------------------------------------------------------
// SpriteActor — controllable PixiJS sprite with state-based animations
// ---------------------------------------------------------------------------

/** Controllable sprite instance with animation and movement. */
export interface SpriteActor {
  /** Switch to a state animation (idle/thinking/working/sleeping) */
  setState(state: SpriteState): void;

  /** Tween sprite to a target position over duration ms */
  walkTo(x: number, y: number, durationMs?: number): void;

  /** Show a temporary speech/thought bubble above the sprite */
  playBubble(text: string, durationMs?: number): void;

  /** Set visibility */
  setVisible(visible: boolean): void;

  /** Clean up this actor's resources */
  destroy(): void;
}

export class PixiSpriteActor implements SpriteActor {
  private container: Container;
  private blob: Graphics;
  private overlay?: Graphics; // sparkles/gear
  private bubbleText?: Text;
  private state: SpriteState = "idle";
  private baseColor: number;
  private baseX: number = 0;
  private baseY: number = 0;
  private startTime: number = Date.now();
  private destroyed = false;

  constructor(
    private app: Application,
    spriteId: string,
    private radius: number = 24,
  ) {
    this.baseColor = spriteIdToColor(spriteId);
    this.container = new Container();

    // Main blob
    this.blob = new Graphics();
    this.container.addChild(this.blob);

    // Start animation ticker
    this.app.ticker.add(this.tick, this);
    this.redraw();
  }

  setState(state: SpriteState): void {
    this.state = state;
    this.redraw();
  }

  walkTo(x: number, y: number, durationMs: number = 500): void {
    // Simple linear tween for MVP (no easing library dependency)
    const startX = this.baseX;
    const startY = this.baseY;
    const startTime = Date.now();
    const endTime = startTime + durationMs;

    const tweenTick = () => {
      const now = Date.now();
      if (now >= endTime || this.destroyed) {
        this.baseX = x;
        this.baseY = y;
        this.app.ticker.remove(tweenTick);
        return;
      }
      const t = (now - startTime) / durationMs;
      this.baseX = startX + (x - startX) * t;
      this.baseY = startY + (y - startY) * t;
    };

    this.app.ticker.add(tweenTick);
  }

  playBubble(text: string, durationMs: number = 2000): void {
    // Remove old bubble if any
    if (this.bubbleText) {
      this.container.removeChild(this.bubbleText);
      this.bubbleText.destroy();
    }

    this.bubbleText = new Text({
      text,
      style: {
        fontSize: 14,
        fill: 0xffffff,
        align: "center",
      },
    });
    this.bubbleText.anchor.set(0.5, 1);
    this.bubbleText.position.set(0, -this.radius - 10);
    this.container.addChild(this.bubbleText);

    setTimeout(() => {
      if (this.bubbleText && !this.destroyed) {
        this.container.removeChild(this.bubbleText);
        this.bubbleText.destroy();
        this.bubbleText = undefined;
      }
    }, durationMs);
  }

  setVisible(visible: boolean): void {
    this.container.visible = visible;
  }

  destroy(): void {
    this.destroyed = true;
    this.app.ticker.remove(this.tick, this);
    if (this.bubbleText) {
      this.bubbleText.destroy();
    }
    if (this.overlay) {
      this.overlay.destroy();
    }
    this.blob.destroy();
    this.container.destroy();
  }

  /**
   * Animation tick: update position (bob), color-shift, and state overlays.
   */
  private tick = (): void => {
    if (this.destroyed) return;

    const elapsed = Date.now() - this.startTime;

    // Bob animation (state-dependent speed)
    let bobPeriod = 1500; // idle
    let bobRange = 4;
    if (this.state === "thinking") {
      bobPeriod = 800; // faster
      bobRange = 6;
    } else if (this.state === "sleeping") {
      bobPeriod = 2500; // slower
      bobRange = 2;
    }
    const bobY = computeBobOffset(elapsed, bobPeriod, bobRange);

    // Color shift animation
    const hueShift = computeHueShift(elapsed, 4000, 10);
    const shiftedColor = this.shiftHue(this.baseColor, hueShift);

    // Update container position
    this.container.position.set(this.baseX, this.baseY + bobY);

    // Redraw pixel mascot with shifted color
    this.blob.clear();
    this.drawPixelMascot(shiftedColor, this.state === "sleeping" ? 0.5 : 1);

    // State-specific overlays
    this.updateOverlay(elapsed);
  };

  private updateOverlay(elapsed: number): void {
    if (this.overlay) {
      this.container.removeChild(this.overlay);
      this.overlay.destroy();
      this.overlay = undefined;
    }

    if (this.state === "thinking") {
      // White sparkle overlay (small circle pulsing)
      this.overlay = new Graphics();
      const sparkleSize = 4 + Math.sin((elapsed / 300) * Math.PI * 2) * 2;
      this.overlay.circle(this.radius * 0.5, -this.radius * 0.5, sparkleSize);
      this.overlay.fill({ color: 0xffffff, alpha: 0.8 });
      this.container.addChild(this.overlay);
    } else if (this.state === "working") {
      // Rotating gear-like triangle
      this.overlay = new Graphics();
      const angle = (elapsed / 1000) * Math.PI * 2; // 1 rotation/sec
      this.overlay.rotation = angle;
      const gearRadius = 8;
      this.overlay.moveTo(gearRadius, 0);
      this.overlay.lineTo(-gearRadius / 2, gearRadius * 0.866);
      this.overlay.lineTo(-gearRadius / 2, -gearRadius * 0.866);
      this.overlay.closePath();
      this.overlay.fill({ color: 0xffaa00 });
      this.overlay.position.set(this.radius, 0);
      this.container.addChild(this.overlay);
    } else if (this.state === "sleeping") {
      // "Z" bubble text (already handled by playBubble in setState redraw)
      // We'll auto-trigger it once when entering sleeping
    }
  }

  private drawPixelMascot(color: number, alpha: number): void {
    const unit = this.radius / 4;
    const pixels: Array<[number, number]> = [
      [-1, -3], [0, -3],
      [-2, -2], [-1, -2], [0, -2], [1, -2],
      [-2, -1], [-1, -1], [0, -1], [1, -1],
      [-1, 0], [0, 0],
      [-3, 1], [-1, 1], [0, 1], [2, 1],
      [-3, 2], [-1, 2], [0, 2], [2, 2],
      [-2, 3], [1, 3],
    ];

    for (const [x, y] of pixels) {
      this.blob.rect(x * unit, y * unit, unit, unit);
      this.blob.fill({ color, alpha });
    }

    // eyes
    this.blob.rect(-1.35 * unit, -1.4 * unit, unit * 0.55, unit * 0.55);
    this.blob.rect(0.8 * unit, -1.4 * unit, unit * 0.55, unit * 0.55);
    this.blob.fill({ color: 0xffffff, alpha });
  }

  private redraw(): void {
    // Trigger overlay refresh immediately
    this.tick();

    // Special case: show "Z" bubble when entering sleeping
    if (this.state === "sleeping" && !this.bubbleText) {
      this.playBubble("Z", 10000); // long duration, will be cleared on state change
    } else if (this.state !== "sleeping" && this.bubbleText?.text === "Z") {
      // Clear Z bubble when leaving sleeping
      if (this.bubbleText) {
        this.container.removeChild(this.bubbleText);
        this.bubbleText.destroy();
        this.bubbleText = undefined;
      }
    }
  }

  private shiftHue(color: number, hueDelta: number): number {
    // Extract RGB
    const r = ((color >> 16) & 0xff) / 255;
    const g = ((color >> 8) & 0xff) / 255;
    const b = (color & 0xff) / 255;

    // Convert to HSL
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0,
      s = 0;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }

    // Shift hue
    h = (h * 360 + hueDelta) % 360;
    if (h < 0) h += 360;

    return hslToRgb(h, s * 100, l * 100);
  }

  /** Get the PixiJS container for adding to a parent stage/container. */
  getContainer(): Container {
    return this.container;
  }
}

// ---------------------------------------------------------------------------
// Room — container for background + actors
// ---------------------------------------------------------------------------

/** A room container holding background, furniture, and an agent sprite. */
export interface Room {
  /** Add a sprite actor to this room at position */
  addActor(actor: SpriteActor, x: number, y: number): void;

  /** Remove a sprite actor from this room */
  removeActor(actor: SpriteActor): void;

  /** Set room background color */
  setBackground(color: number): void;

  /** Clean up this room's resources */
  destroy(): void;
}

export class PixiRoom implements Room {
  private container: Container;
  private background: Graphics;
  private actors: Set<PixiSpriteActor> = new Set();

  constructor(private app: Application) {
    this.container = new Container();
    this.background = new Graphics();
    this.container.addChild(this.background);
    this.app.stage.addChild(this.container);
    this.setBackground(0x1a1a2e); // default dark blue
  }

  addActor(actor: SpriteActor, x: number, y: number): void {
    if (actor instanceof PixiSpriteActor) {
      this.actors.add(actor);
      const actorContainer = actor.getContainer();
      actorContainer.position.set(x, y);
      this.container.addChild(actorContainer);
    }
  }

  removeActor(actor: SpriteActor): void {
    if (actor instanceof PixiSpriteActor) {
      this.actors.delete(actor);
      this.container.removeChild(actor.getContainer());
    }
  }

  setBackground(color: number): void {
    this.background.clear();
    // Fill entire app screen
    this.background.rect(0, 0, this.app.screen.width, this.app.screen.height);
    this.background.fill(color);
  }

  /** Get the PixiJS container for visual composition/custom styling. */
  getContainer(): Container {
    return this.container;
  }

  destroy(): void {
    for (const actor of this.actors) {
      actor.destroy();
    }
    this.actors.clear();
    this.background.destroy();
    this.container.destroy();
  }
}

// ---------------------------------------------------------------------------
// Stubs (kept for back-compat if any code still references them)
// ---------------------------------------------------------------------------

/** @deprecated Use PixiSpriteActor instead. */
export class StubSpriteActor implements SpriteActor {
  setState(_state: SpriteState): void {}
  walkTo(_x: number, _y: number, _durationMs?: number): void {}
  playBubble(_text: string, _durationMs?: number): void {}
  setVisible(_visible: boolean): void {}
  destroy(): void {}
}

/** @deprecated Use PixiRoom instead. */
export class StubRoom implements Room {
  addActor(_actor: SpriteActor, _x: number, _y: number): void {}
  removeActor(_actor: SpriteActor): void {}
  setBackground(_color: number): void {}
  destroy(): void {}
}
