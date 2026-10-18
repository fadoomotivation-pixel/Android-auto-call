import { ImageResponse } from "next/og";
import { OG, OG_SIZE } from "./ogTheme";

// One shared 1200x630 card: brand, big title, one line under it.
export function ogCard(title: string, sub: string, tag = "Free calling CRM for real estate") {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: OG.bg, padding: 56 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", background: OG.card, borderRadius: 40, padding: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: OG.blue }} />
            <div style={{ fontSize: 36, fontWeight: 700, color: OG.ink }}>Call Pro AI</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 68, fontWeight: 700, color: OG.ink, lineHeight: 1.1 }}>{title}</div>
            <div style={{ fontSize: 34, color: OG.sub }}>{sub}</div>
          </div>
          <div style={{ fontSize: 28, color: OG.blue, fontWeight: 600 }}>{tag}</div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
