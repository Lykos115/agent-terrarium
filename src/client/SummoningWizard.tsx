import { useState, useEffect, useRef } from "react";
import { Application } from "pixi.js";
import { PixiSpriteActor } from "../modules/sprite-engine";
import { useTerrariumStore } from "./store";
import {
  SPECIALTIES,
  SPRITE_KITS,
  suggestNameForSpecialty,
  defaultTierFor,
  defaultPersonalityFor,
} from "./summoning-presets";
import type { AgentConfig, Specialty, ModelTier } from "../types";

/**
 * Summoning Wizard — 4-step modal for configuring and creating a new agent.
 *
 * Opened by setting `store.ui.wizardOpen = true`. Closes on ESC, backdrop
 * click, or successful summon.
 *
 * Props:
 * - `onSummon(config: AgentConfig): void` — callback invoked when the user
 *   clicks "Summon" at the end. The parent (App.tsx) should call
 *   `requestCreateAgent(ws, config)` here. Decouples this component from
 *   the WebSocket dependency.
 */
export function SummoningWizard({
  onSummon,
}: {
  onSummon: (config: AgentConfig) => void;
}) {
  const wizardOpen = useTerrariumStore((s) => s.ui.wizardOpen);
  const setWizardOpen = useTerrariumStore((s) => s.setWizardOpen);
  const agents = useTerrariumStore((s) => s.agentList);

  const [step, setStep] = useState(1);
  const [selectedSpecialty, setSelectedSpecialty] = useState<Specialty | null>(
    null,
  );
  const [selectedTier, setSelectedTier] = useState<ModelTier>("Balanced");
  const [selectedSpriteId, setSelectedSpriteId] = useState<string>(
    SPRITE_KITS[0].id,
  );
  const [agentName, setAgentName] = useState("");

  const modalRef = useRef<HTMLDivElement>(null);

  // Reset wizard state when it opens
  useEffect(() => {
    if (wizardOpen) {
      setStep(1);
      setSelectedSpecialty(null);
      setSelectedTier("Balanced");
      setSelectedSpriteId(SPRITE_KITS[0].id);
      setAgentName("");
    }
  }, [wizardOpen]);

  // Focus into modal on open (accessibility)
  useEffect(() => {
    if (wizardOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [wizardOpen]);

  // ESC key handler
  useEffect(() => {
    if (!wizardOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setWizardOpen(false);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [wizardOpen, setWizardOpen]);

  if (!wizardOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      setWizardOpen(false);
    }
  };

  const handleNext = () => {
    if (step === 1 && selectedSpecialty) {
      // Auto-populate tier and personality from specialty
      setSelectedTier(defaultTierFor(selectedSpecialty));
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      // Auto-suggest name based on specialty and existing agent count
      const existingCount = agents.filter(
        (a) => a.specialty === selectedSpecialty,
      ).length;
      setAgentName(suggestNameForSpecialty(selectedSpecialty!, existingCount));
      setStep(4);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSummon = () => {
    if (!selectedSpecialty) return;
    const config: AgentConfig = {
      name: agentName.trim() || "Unnamed Agent",
      specialty: selectedSpecialty,
      spriteId: selectedSpriteId,
      personality: defaultPersonalityFor(selectedSpecialty),
      modelTier: selectedTier,
    };
    onSummon(config);
    setWizardOpen(false);
  };

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        style={{
          background: "#1a1a2e",
          border: "1px solid #3a3a6a",
          borderRadius: 8,
          maxWidth: 600,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          padding: 32,
          outline: "none",
        }}
      >
        {/* Header */}
        <h2
          style={{
            margin: "0 0 8px 0",
            fontSize: 24,
            fontWeight: 600,
            color: "#e5e5f0",
          }}
        >
          Summon Agent
        </h2>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>
          Step {step} of 4
        </div>

        {/* Step content */}
        {step === 1 && (
          <Step1Specialty
            selected={selectedSpecialty}
            onSelect={setSelectedSpecialty}
          />
        )}
        {step === 2 && (
          <Step2Tier selected={selectedTier} onSelect={setSelectedTier} />
        )}
        {step === 3 && (
          <Step3SpriteKit
            selected={selectedSpriteId}
            onSelect={setSelectedSpriteId}
          />
        )}
        {step === 4 && (
          <Step4Confirm
            specialty={selectedSpecialty!}
            tier={selectedTier}
            spriteId={selectedSpriteId}
            name={agentName}
            onNameChange={setAgentName}
          />
        )}

        {/* Footer navigation */}
        <div
          style={{
            marginTop: 32,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <button
            onClick={handleBack}
            disabled={step === 1}
            style={{
              padding: "10px 20px",
              background: step === 1 ? "#222" : "#3a3a6a",
              color: step === 1 ? "#555" : "#e5e5f0",
              border: "none",
              borderRadius: 6,
              cursor: step === 1 ? "not-allowed" : "pointer",
              fontSize: 14,
            }}
          >
            Back
          </button>

          {step < 4 ? (
            <button
              onClick={handleNext}
              disabled={step === 1 && !selectedSpecialty}
              style={{
                padding: "10px 20px",
                background:
                  step === 1 && !selectedSpecialty ? "#222" : "#6b9dff",
                color:
                  step === 1 && !selectedSpecialty ? "#555" : "#0f0f23",
                border: "none",
                borderRadius: 6,
                cursor:
                  step === 1 && !selectedSpecialty ? "not-allowed" : "pointer",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSummon}
              style={{
                padding: "10px 20px",
                background: "#6cf093",
                color: "#0f0f23",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Summon
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Specialty selection
// ---------------------------------------------------------------------------

function Step1Specialty({
  selected,
  onSelect,
}: {
  selected: Specialty | null;
  onSelect: (s: Specialty) => void;
}) {
  return (
    <div>
      <h3
        style={{
          margin: "0 0 16px 0",
          fontSize: 18,
          fontWeight: 500,
          color: "#e5e5f0",
        }}
      >
        Choose a specialty
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 12,
        }}
      >
        {SPECIALTIES.map((card) => {
          const isSelected = selected === card.id;
          return (
            <div
              key={card.id}
              onClick={() => onSelect(card.id)}
              style={{
                padding: 16,
                border: isSelected
                  ? "2px solid #6b9dff"
                  : "1px solid #3a3a6a",
                borderRadius: 6,
                background: isSelected ? "#252540" : "#1a1a2e",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (!isSelected)
                  e.currentTarget.style.borderColor = "#4a4a7a";
              }}
              onMouseLeave={(e) => {
                if (!isSelected)
                  e.currentTarget.style.borderColor = "#3a3a6a";
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 6,
                  color: "#e5e5f0",
                }}
              >
                {specialtyIcon(card.id)} {card.title}
              </div>
              <div style={{ fontSize: 13, color: "#aaa" }}>
                {card.description}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Tier selection
// ---------------------------------------------------------------------------

function specialtyIcon(specialty: Specialty): string {
  switch (specialty) {
    case "Code Reviewer": return "🔎";
    case "Spec Griller": return "🔥";
    case "General Chat": return "💬";
    case "DevOps": return "🚀";
    case "Creative Writer": return "✍️";
    case "Researcher": return "📚";
    case "Debugger": return "🐞";
  }
}

function Step2Tier({
  selected,
  onSelect,
}: {
  selected: ModelTier;
  onSelect: (t: ModelTier) => void;
}) {
  const tiers: Array<{ tier: ModelTier; model: string; description: string }> = [
    {
      tier: "Budget",
      model: "Gemma 3 27B",
      description: "Fast, efficient — ideal for simple tasks and quick chats.",
    },
    {
      tier: "Balanced",
      model: "Claude Sonnet 4.6",
      description:
        "Best of both worlds — capable reasoning without breaking the bank.",
    },
    {
      tier: "Premium",
      model: "Claude Opus 4.6",
      description:
        "Top-tier model — deep thinking, complex problem-solving, premium results.",
    },
  ];

  return (
    <div>
      <h3
        style={{
          margin: "0 0 16px 0",
          fontSize: 18,
          fontWeight: 500,
          color: "#e5e5f0",
        }}
      >
        Select model tier
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {tiers.map(({ tier, model, description }) => {
          const isSelected = selected === tier;
          return (
            <label
              key={tier}
              style={{
                display: "flex",
                alignItems: "flex-start",
                padding: 16,
                border: isSelected
                  ? "2px solid #6b9dff"
                  : "1px solid #3a3a6a",
                borderRadius: 6,
                background: isSelected ? "#252540" : "#1a1a2e",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (!isSelected)
                  e.currentTarget.style.borderColor = "#4a4a7a";
              }}
              onMouseLeave={(e) => {
                if (!isSelected)
                  e.currentTarget.style.borderColor = "#3a3a6a";
              }}
            >
              <input
                type="radio"
                name="tier"
                value={tier}
                checked={isSelected}
                onChange={() => onSelect(tier)}
                style={{ marginRight: 12, marginTop: 2, cursor: "pointer" }}
              />
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: 4,
                    color: "#e5e5f0",
                  }}
                >
                  {tier} <span style={{ color: "#888", fontWeight: 400 }}>— {model}</span>
                </div>
                <div style={{ fontSize: 13, color: "#aaa" }}>
                  {description}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Sprite kit selection
// ---------------------------------------------------------------------------

function Step3SpriteKit({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <h3
        style={{
          margin: "0 0 16px 0",
          fontSize: 18,
          fontWeight: 500,
          color: "#e5e5f0",
        }}
      >
        Pick a sprite kit
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 12,
        }}
      >
        {SPRITE_KITS.map((kit) => {
          const isSelected = selected === kit.id;
          return (
            <div
              key={kit.id}
              onClick={() => onSelect(kit.id)}
              style={{
                padding: 16,
                border: isSelected
                  ? "2px solid #6b9dff"
                  : "1px solid #3a3a6a",
                borderRadius: 6,
                background: isSelected ? "#252540" : "#1a1a2e",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
              onMouseEnter={(e) => {
                if (!isSelected)
                  e.currentTarget.style.borderColor = "#4a4a7a";
              }}
              onMouseLeave={(e) => {
                if (!isSelected)
                  e.currentTarget.style.borderColor = "#3a3a6a";
              }}
            >
              <SpriteKitPreview spriteId={kit.id} accentColor={kit.accentColor} />
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: 4,
                    color: "#e5e5f0",
                  }}
                >
                  {kit.name}
                </div>
                <div style={{ fontSize: 13, color: "#aaa" }}>
                  {kit.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

function SpriteKitPreview({
  spriteId,
  accentColor,
}: {
  spriteId: string;
  accentColor: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let app: Application | null = null;
    let actor: PixiSpriteActor | null = null;

    async function mount() {
      if (!hostRef.current) return;
      app = new Application();
      await app.init({
        width: 60,
        height: 60,
        backgroundAlpha: 0,
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (cancelled || !hostRef.current) {
        app.destroy(true);
        return;
      }
      hostRef.current.replaceChildren(app.canvas);
      actor = new PixiSpriteActor(app, spriteId, 18);
      actor.setState("idle");
      actor.getContainer().position.set(30, 34);
      app.stage.addChild(actor.getContainer());
    }

    void mount();
    return () => {
      cancelled = true;
      actor?.destroy();
      app?.destroy(true);
    };
  }, [spriteId]);

  return (
    <div
      ref={hostRef}
      style={{
        width: 60,
        height: 60,
        flexShrink: 0,
        filter: `drop-shadow(0 0 10px ${accentColor})`,
      }}
      aria-label={`${spriteId} idle preview`}
    />
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Name & confirm
// ---------------------------------------------------------------------------

function Step4Confirm({
  specialty,
  tier,
  spriteId,
  name,
  onNameChange,
}: {
  specialty: Specialty;
  tier: ModelTier;
  spriteId: string;
  name: string;
  onNameChange: (n: string) => void;
}) {
  const spriteKit = SPRITE_KITS.find((k) => k.id === spriteId);

  return (
    <div>
      <h3
        style={{
          margin: "0 0 16px 0",
          fontSize: 18,
          fontWeight: 500,
          color: "#e5e5f0",
        }}
      >
        Name your agent
      </h3>

      <input
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Agent name"
        autoFocus
        style={{
          width: "100%",
          padding: "12px 16px",
          background: "#0f0f23",
          border: "1px solid #3a3a6a",
          borderRadius: 6,
          color: "#e5e5f0",
          fontSize: 14,
          marginBottom: 24,
          outline: "none",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "#6b9dff")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "#3a3a6a")}
      />

      <div
        style={{
          padding: 16,
          background: "#0f0f23",
          border: "1px solid #3a3a6a",
          borderRadius: 6,
        }}
      >
        <h4
          style={{
            margin: "0 0 12px 0",
            fontSize: 14,
            fontWeight: 600,
            color: "#aaa",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Summary
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SummaryRow label="Specialty" value={specialty} />
          <SummaryRow label="Model Tier" value={tier} />
          <SummaryRow label="Sprite Kit" value={spriteKit?.name ?? "Unknown"} />
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "#888", fontSize: 13 }}>{label}:</span>
      <span style={{ color: "#e5e5f0", fontSize: 13, fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}
