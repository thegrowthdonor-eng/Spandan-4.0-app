import Image from "next/image";

export default function RootLoading() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "75dvh",
        padding: "32px 16px",
        textAlign: "center",
      }}
      aria-live="polite"
      aria-busy="true"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "16px",
          maxWidth: "360px",
          width: "100%",
        }}
      >
        {/* Pulsing logo icon */}
        <div
          style={{
            position: "relative",
            width: "80px",
            height: "80px",
            display: "grid",
            placeItems: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(169, 83, 62, 0.25) 0%, rgba(226, 160, 72, 0.05) 70%, transparent 100%)",
              animation: "spandanPulse 1.6s ease-in-out infinite",
            }}
          />
          <Image
            src="/spandan-logo.png"
            alt="SPANDAN 4.0"
            width={64}
            height={64}
            priority
            style={{
              objectFit: "contain",
              filter: "drop-shadow(0 4px 12px rgba(169, 83, 62, 0.3))",
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <p
            style={{
              font: "700 11px/1 'DM Mono', monospace",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#a9533e",
              margin: 0,
            }}
          >
            SPANDAN 4.0 · ASMC FIROZABAD
          </p>
          <h2
            style={{
              font: "500 20px/1.3 'Playfair Display', Georgia, serif",
              color: "#242b29",
              margin: 0,
            }}
          >
            Loading arena…
          </h2>
        </div>

        {/* Shimmer progress line */}
        <div
          style={{
            width: "160px",
            height: "4px",
            background: "#e8ded1",
            borderRadius: "4px",
            overflow: "hidden",
            position: "relative",
            marginTop: "6px",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "50%",
              background: "linear-gradient(90deg, #a9533e, #e2a048)",
              borderRadius: "4px",
              animation: "spandanShimmer 1.2s ease-in-out infinite",
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes spandanPulse {
          0%, 100% { transform: scale(0.92); opacity: 0.5; }
          50% { transform: scale(1.18); opacity: 1; }
        }
        @keyframes spandanShimmer {
          0% { left: -50%; }
          100% { left: 100%; }
        }
      `}</style>
    </main>
  );
}
