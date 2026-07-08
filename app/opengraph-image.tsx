import { ImageResponse } from "next/og";

export const alt = "PaidPolitely Analytics";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f7f8fb",
          color: "#0f172a",
          padding: 72,
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 28,
              background: "#0f172a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#e83e8c",
              fontSize: 58,
              fontWeight: 900,
            }}
          >
            P
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 44, fontWeight: 900, letterSpacing: -2 }}>PaidPolitely</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: "#64748b", letterSpacing: 4 }}>ANALYTICS</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <h1 style={{ margin: 0, maxWidth: 920, fontSize: 82, lineHeight: 0.96, letterSpacing: -5, fontWeight: 900 }}>
            Reddit creator intelligence that feels production-ready.
          </h1>
          <p style={{ margin: 0, maxWidth: 820, color: "#475569", fontSize: 30, lineHeight: 1.35 }}>
            Subreddit performance, format signals, timing analysis, and next-post planning.
          </p>
        </div>
      </div>
    ),
    size,
  );
}
