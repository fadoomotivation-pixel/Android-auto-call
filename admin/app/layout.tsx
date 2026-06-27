import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Call Pro AI — Real Estate Sales, Simplified",
    template: "%s · Call Pro AI",
  },
  description: "The AI calling CRM for real-estate teams — auto-dialer, call recordings, hot-lead alerts, follow-ups and a clear funnel to booking.",
  metadataBase: new URL("https://callproai.in"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
