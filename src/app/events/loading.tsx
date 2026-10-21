export default function EventsLoading() {
  return (
    <main className="events-page" aria-busy="true" aria-live="polite">
      {/* Skeleton Top Nav */}
      <div style={{ height: "54px", borderBottom: "1px solid #e8ded1", background: "rgba(246, 245, 241, 0.8)" }} />

      {/* Skeleton Hero Banner */}
      <section className="events-hero" style={{ padding: "36px 20px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: "560px", margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <div className="skeleton-box" style={{ width: "220px", height: "24px", borderRadius: "100px" }} />
          <div className="skeleton-box" style={{ width: "80%", height: "42px", borderRadius: "8px" }} />
          <div className="skeleton-box" style={{ width: "60%", height: "18px", borderRadius: "6px" }} />
        </div>
      </section>

      {/* Skeleton Filter Chips */}
      <div style={{ maxWidth: "1180px", margin: "0 auto 28px", padding: "0 20px", display: "flex", gap: "10px", overflowX: "auto" }}>
        {[80, 110, 95, 120, 90].map((width, i) => (
          <div key={i} className="skeleton-box" style={{ width: `${width}px`, height: "36px", borderRadius: "20px", flexShrink: 0 }} />
        ))}
      </div>

      {/* Skeleton Cards Grid */}
      <section style={{ maxWidth: "1180px", margin: "0 auto", padding: "0 20px 60px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "24px",
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div
              key={idx}
              style={{
                borderRadius: "14px",
                border: "1px solid #e8ded1",
                background: "#ffffff",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="skeleton-box" style={{ width: "90px", height: "22px", borderRadius: "6px" }} />
                <div className="skeleton-box" style={{ width: "60px", height: "20px", borderRadius: "100px" }} />
              </div>
              <div className="skeleton-box" style={{ width: "75%", height: "26px", borderRadius: "6px" }} />
              <div className="skeleton-box" style={{ width: "100%", height: "44px", borderRadius: "6px" }} />
              <div style={{ marginTop: "auto", paddingTop: "12px", borderTop: "1px solid #f0eae1", display: "flex", justifyContent: "space-between" }}>
                <div className="skeleton-box" style={{ width: "110px", height: "18px", borderRadius: "4px" }} />
                <div className="skeleton-box" style={{ width: "80px", height: "18px", borderRadius: "4px" }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <style>{`
        .skeleton-box {
          background: linear-gradient(90deg, #ede5da 0%, #f7f3ec 50%, #ede5da 100%);
          background-size: 200% 100%;
          animation: skeletonShimmer 1.5s infinite;
        }
        @keyframes skeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </main>
  );
}
