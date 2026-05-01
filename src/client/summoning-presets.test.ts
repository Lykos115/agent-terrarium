import { describe, it, expect } from "bun:test";
import {
  SPECIALTIES,
  SPRITE_KITS,
  suggestNameForSpecialty,
  defaultTierFor,
  defaultPersonalityFor,
} from "./summoning-presets";
import type { Specialty, ModelTier } from "../types";

describe("summoning-presets", () => {
  describe("SPECIALTIES", () => {
    it("has exactly 7 specialty cards", () => {
      expect(SPECIALTIES).toHaveLength(7);
    });

    it("all specialty IDs are valid Specialty types", () => {
      const validSpecialties: Specialty[] = [
        "Code Reviewer",
        "Spec Griller",
        "General Chat",
        "DevOps",
        "Creative Writer",
        "Researcher",
        "Debugger",
      ];
      for (const card of SPECIALTIES) {
        expect(validSpecialties).toContain(card.id);
      }
    });

    it("all descriptions are ≤ 120 characters", () => {
      for (const card of SPECIALTIES) {
        expect(card.description.length).toBeLessThanOrEqual(120);
      }
    });

    it("all default tiers are valid ModelTier values", () => {
      const validTiers: ModelTier[] = ["Budget", "Balanced", "Premium"];
      for (const card of SPECIALTIES) {
        expect(validTiers).toContain(card.defaultTier);
      }
    });

    it("all default personalities are non-empty strings", () => {
      for (const card of SPECIALTIES) {
        expect(card.defaultPersonality).toBeTruthy();
        expect(typeof card.defaultPersonality).toBe("string");
      }
    });
  });

  describe("SPRITE_KITS", () => {
    it("has exactly 3 sprite kits", () => {
      expect(SPRITE_KITS).toHaveLength(3);
    });

    it("all kit IDs match seed sprite patterns", () => {
      // These IDs should align with the seed agents in agent-store.ts
      const ids = SPRITE_KITS.map((k) => k.id);
      expect(ids).toContain("sprite-glitchkin");
      expect(ids).toContain("sprite-mapsie");
      expect(ids).toContain("sprite-blipblop");
    });

    it("all accent colors are valid hex strings", () => {
      for (const kit of SPRITE_KITS) {
        expect(kit.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });

  describe("suggestNameForSpecialty", () => {
    it("formats name as '{Specialty} #{count + 1}'", () => {
      expect(suggestNameForSpecialty("Code Reviewer", 0)).toBe(
        "Code Reviewer #1",
      );
      expect(suggestNameForSpecialty("Code Reviewer", 1)).toBe(
        "Code Reviewer #2",
      );
      expect(suggestNameForSpecialty("General Chat", 5)).toBe(
        "General Chat #6",
      );
    });

    it("is deterministic for the same inputs", () => {
      const name1 = suggestNameForSpecialty("Debugger", 3);
      const name2 = suggestNameForSpecialty("Debugger", 3);
      expect(name1).toBe(name2);
    });
  });

  describe("defaultTierFor", () => {
    it("returns the correct tier for each specialty", () => {
      expect(defaultTierFor("Code Reviewer")).toBe("Premium");
      expect(defaultTierFor("Spec Griller")).toBe("Balanced");
      expect(defaultTierFor("General Chat")).toBe("Budget");
      expect(defaultTierFor("Researcher")).toBe("Premium");
    });

    it("returns 'Balanced' for unknown specialty (fallback)", () => {
      expect(defaultTierFor("Unknown" as Specialty)).toBe("Balanced");
    });
  });

  describe("defaultPersonalityFor", () => {
    it("returns the correct personality for each specialty", () => {
      expect(defaultPersonalityFor("Code Reviewer")).toBe("technical");
      expect(defaultPersonalityFor("Spec Griller")).toBe("grillme");
      expect(defaultPersonalityFor("General Chat")).toBe("concise");
      expect(defaultPersonalityFor("Creative Writer")).toBe("creative");
    });

    it("returns 'helpful' for unknown specialty (fallback)", () => {
      expect(defaultPersonalityFor("Unknown" as Specialty)).toBe("helpful");
    });
  });
});
