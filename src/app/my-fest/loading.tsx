export default function MyFestLoading() {
  return (
    <main className="my-fest-page" aria-busy="true" aria-live="polite" style={{ padding: "24px 16px 80px", maxWidth: "680px", margin: "0 auto" }}>
      {/* Header Skeleton */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px" }}>
        <div className="skeleton-box" style={{ width: "130px", height: "32px", borderRadius: "6px" }} />
        <div className="skeleton-box" style={{ width: "80px", height: "32px", borderRadius: "100px" }} />
      </div>

      {/* Student Pass ID Card Skeleton */}
      <div
        style={{
          borderRadius: "16px",
          border: "1px solid #e8ded1",
          background: "#ffffff",
          padding: "24px",
          marginBottom: "28px",
          boxShadow: "0 8px 24px rgba(36, 43, 41, 0.04)",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="skeleton-box" style={{ width: "140px", height: "20px", borderRadius: "4px" }} />
          <div className="skeleton-box" style={{ width: "70px", height: "24px", borderRadius: "100px" }} />
        </div>
        <div className="skeleton-box" style={{ width: "65%", height: "32px", borderRadius: "6px" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", paddingTop: "8px" }}>
          <div className="skeleton-box" style={{ height: "40px", borderRadius: "8px" }} />
          <div className="skeleton-box" style={{ height: "40px", borderRadius: "8px" }} />
        </div>
      </div>

      {/* Applications Section Skeleton */}
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div className="skeleton-box" style={{ width: "160px", height: "24px", borderRadius: "4px" }} />
        {[1, 2].map((i) => (
          <div
            key={i}
            style={{
              borderRadius: "12px",
              border: "1px solid #e8ded1",
              background: "#ffffff",
              padding: "18px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div className="skeleton-box" style={{ width: "50%", height: "22px", borderRadius: "4px" }} />
              <div className="skeleton-box" style={{ width: "75px", height: "20px", borderRadius: "100px" }} />
            </div>
            <div className="skeleton-box" style={{ width: "70%", height: "16px", borderRadius: "4px" }} />
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
