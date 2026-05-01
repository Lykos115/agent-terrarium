import type { Specialty, ModelTier } from "../types";

/**
 * Summoning Wizard presets — specialty cards, sprite kits, and helpers.
 *
 * Pure data + mapping functions. No UI logic here; that lives in
 * SummoningWizard.tsx.
 */

// ---------------------------------------------------------------------------
// Specialty cards (step 1)
// ---------------------------------------------------------------------------

export interface SpecialtyCard {
  id: Specialty;
  title: string;
  description: string;
  defaultTier: ModelTier;
  defaultPersonality: string;
}

/**
 * The 7 specialty cards with descriptions (≤ 120 chars, playful tone).
 * Each specialty has a recommended tier and personality template.
 */
export const SPECIALTIES: SpecialtyCard[] = [
  {
    id: "Code Reviewer",
    title: "Code Reviewer",
    description:
      "Peer reviews pull requests with a keen eye for bugs, style, and edge cases. Nitpicky in the best way.",
    defaultTier: "Premium",
    defaultPersonality: "technical",
  },
  {
    id: "Spec Griller",
    title: "Spec Griller",
    description:
      "Asks the hard questions about requirements until your spec is bulletproof. Loves finding gaps.",
    defaultTier: "Balanced",
    defaultPersonality: "grillme",
  },
  {
    id: "General Chat",
    title: "General Chat",
    description:
      "Your versatile companion — brainstorm ideas, refine plans, or just chat about the project.",
    defaultTier: "Budget",
    defaultPersonality: "concise",
  },
  {
    id: "DevOps",
    title: "DevOps",
    description:
      "Deployment pipelines, infrastructure wrangling, and the dark arts of CI/CD. Loves a good bash script.",
    defaultTier: "Balanced",
    defaultPersonality: "technical",
  },
  {
    id: "Creative Writer",
    title: "Creative Writer",
    description:
      "Crafts polished docs, READMEs, and marketing copy. Wordsmith with a flair for storytelling.",
    defaultTier: "Balanced",
    defaultPersonality: "creative",
  },
  {
    id: "Researcher",
    title: "Researcher",
    description:
      "Deep dives into APIs, RFCs, and Stack Overflow threads. Returns with citations and best practices.",
    defaultTier: "Premium",
    defaultPersonality: "thorough",
  },
  {
    id: "Debugger",
    title: "Debugger",
    description:
      "Traces stack traces, console logs, and memory leaks like a detective. 'Works on my machine' is not acceptable.",
    defaultTier: "Balanced",
    defaultPersonality: "technical",
  },
];

// ---------------------------------------------------------------------------
// Sprite kits (step 3)
// ---------------------------------------------------------------------------

export interface SpriteKit {
  id: string;
  name: string;
  description: string;
  accentColor: string; // hex color for placeholder preview blob
}

/**
 * The 3 sprite kits. IDs align with seeds in agent-store.ts.
 * For MVP, the wizard shows a colored blob with CSS animation as a preview;
 * the real PixiJS sprite loads later in the grid/room.
 */
export const SPRITE_KITS: SpriteKit[] = [
  {
    id: "sprite-glitchkin",
    name: "Glitchkin",
    description: "Cyberpunk energy — neon glitches and digital flair.",
    accentColor: "#ff6b9d", // pink/red
  },
  {
    id: "sprite-mapsie",
    name: "Mapsie",
    description: "Cartographer vibes — steady, reliable, loves a good grid.",
    accentColor: "#6bcf7f", // green
  },
  {
    id: "sprite-blipblop",
    name: "Blipblop",
    description: "Retro beeps and bloops — classic charm in pixel form.",
    accentColor: "#6b9dff", // blue
  },
];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Generate a suggested name for a new agent of the given specialty.
 * Format: "{Specialty} #{count + 1}" (e.g. "Code Reviewer #2").
 * The count should be the number of existing agents with that specialty.
 */
export function suggestNameForSpecialty(
  specialty: Specialty,
  existingCount: number,
): string {
  return `${specialty} #${existingCount + 1}`;
}

/** Lookup the default tier for a specialty. */
export function defaultTierFor(specialty: Specialty): ModelTier {
  const card = SPECIALTIES.find((c) => c.id === specialty);
  return card?.defaultTier ?? "Balanced";
}

/** Lookup the default personality template for a specialty. */
export function defaultPersonalityFor(specialty: Specialty): string {
  const card = SPECIALTIES.find((c) => c.id === specialty);
  return card?.defaultPersonality ?? "helpful";
}
