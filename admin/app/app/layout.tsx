import type { Metadata, Viewport } from "next";
import "./tele.css";
import { RegisterSW } from "./RegisterSW";
import { THEME_COLOR } from "@/lib/tele/theme";

export const metadata: Metadata = {
  title: "Call Pro AI",
  description: "Call your leads, log what happened and never miss a follow-up.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Call Pro AI", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: THEME_COLOR,
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RegisterSW />
      {children}
    </>
  );
}
