import { useTerrariumStore } from "./store";

/**
 * EmptyTerrarium — First-run experience shown when no agents exist.
 *
 * Displays a dark, dormant view with a glowing pulsing summoning portal
 * at center. Clicking the portal opens the summoning wizard modal.
 *
 * GitHub issue: #5
 */
export default function EmptyTerrarium() {
  const setWizardOpen = useTerrariumStore((s) => s.setWizardOpen);

  return (
    <>
      <style>{`
        @keyframes et-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 
              0 0 20px rgba(139, 92, 246, 0.4),
              0 0 40px rgba(139, 92, 246, 0.3),
              0 0 60px rgba(139, 92, 246, 0.2),
              inset 0 0 20px rgba(139, 92, 246, 0.2);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 
              0 0 30px rgba(139, 92, 246, 0.6),
              0 0 60px rgba(139, 92, 246, 0.4),
              0 0 90px rgba(139, 92, 246, 0.3),
              inset 0 0 30px rgba(139, 92, 246, 0.3);
          }
        }

        @keyframes et-pulse-hover {
          0%, 100% {
            transform: scale(1.02);
            box-shadow: 
              0 0 30px rgba(139, 92, 246, 0.5),
              0 0 60px rgba(139, 92, 246, 0.4),
              0 0 90px rgba(139, 92, 246, 0.3),
              inset 0 0 25px rgba(139, 92, 246, 0.25);
          }
          50% {
            transform: scale(1.08);
            box-shadow: 
              0 0 40px rgba(139, 92, 246, 0.7),
              0 0 80px rgba(139, 92, 246, 0.5),
              0 0 120px rgba(139, 92, 246, 0.4),
              inset 0 0 35px rgba(139, 92, 246, 0.35);
          }
        }

        .et-portal {
          animation: et-pulse 2.5s ease-in-out infinite;
        }

        .et-portal:hover {
          animation: et-pulse-hover 2s ease-in-out infinite;
        }

        .et-portal:focus-visible {
          outline: 2px solid rgba(139, 92, 246, 0.8);
          outline-offset: 4px;
        }
      `}</style>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          position: "relative",
          background: "radial-gradient(ellipse at center, rgba(15, 15, 35, 0.6) 0%, #0f0f23 70%)",
        }}
      >
        <button
          className="et-portal"
          onClick={() => setWizardOpen(true)}
          aria-label="Summon your first agent"
          style={{
            width: 180,
            height: 180,
            borderRadius: "50%",
            border: "none",
            background: "radial-gradient(circle at 40% 40%, rgba(139, 92, 246, 0.6), rgba(59, 130, 246, 0.4), rgba(139, 92, 246, 0.1))",
            cursor: "pointer",
            transition: "all 0.2s ease",
            padding: 0,
            position: "relative",
          }}
        >
          {/* Inner glow ring */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 120,
              height: 120,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(139, 92, 246, 0.3), transparent 70%)",
              pointerEvents: "none",
            }}
          />
        </button>

        <div
          style={{
            marginTop: 32,
            fontSize: 15,
            color: "#666",
            textAlign: "center",
            letterSpacing: 0.5,
            maxWidth: 320,
            lineHeight: 1.5,
          }}
        >
          The terrarium is dormant.
          <br />
          Summon your first agent.
        </div>
      </div>
    </>
  );
}
