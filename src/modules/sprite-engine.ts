/**
 * Sprite Engine — PixiJS-based rendering layer.
 *
 * Exports SpriteActor and Room interfaces for the React Canvas component.
 * Stub returns no-op implementations until PixiJS integration in follow-up.
 */

export type SpriteState = "idle" | "thinking" | "working" | "sleeping";

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

/** Stub SpriteActor — no-op for now. */
export class StubSpriteActor implements SpriteActor {
  setState(_state: SpriteState): void {}
  walkTo(_x: number, _y: number, _durationMs?: number): void {}
  playBubble(_text: string, _durationMs?: number): void {}
  setVisible(_visible: boolean): void {}
  destroy(): void {}
}

/** Stub Room — no-op for now. */
export class StubRoom implements Room {
  addActor(_actor: SpriteActor, _x: number, _y: number): void {}
  removeActor(_actor: SpriteActor): void {}
  setBackground(_color: number): void {}
  destroy(): void {}
}
