export default function AdminLoading() {
  return (
    <main style={{ padding: "32px 24px 80px", maxWidth: "1080px", margin: "0 auto" }} aria-busy="true" aria-live="polite">
      {/* Header Skeleton */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div className="skeleton-box" style={{ width: "160px", height: "16px", borderRadius: "4px" }} />
          <div className="skeleton-box" style={{ width: "240px", height: "36px", borderRadius: "6px" }} />
        </div>
        <div className="skeleton-box" style={{ width: "110px", height: "38px", borderRadius: "8px" }} />
      </div>

      {/* Admin Modules Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            style={{
              borderRadius: "14px",
              border: "1px solid #e8ded1",
              background: "#ffffff",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div className="skeleton-box" style={{ width: "40px", height: "40px", borderRadius: "10px" }} />
            <div className="skeleton-box" style={{ width: "65%", height: "24px", borderRadius: "4px" }} />
            <div className="skeleton-box" style={{ width: "90%", height: "16px", borderRadius: "4px" }} />
          </div>
        ))}
      </div>

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
