import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "./components/Analytics";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
  // Only the dashboard uses this face; don't preload it on public pages.
  preload: false,
});

const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
  adjustFontFallback: true,
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const GSC_DEFAULT = "P8DiYEuneITCUi2Lko7NzBtDm--fKJHsejRqU_YVd1U";

export const metadata: Metadata = {
  title: {
    default: "Call Pro AI — Real Estate Sales, Simplified",
    template: "%s · Call Pro AI",
  },
  description:
    "The AI calling CRM for real-estate teams — auto-dialer, call recordings, hot-lead alerts, follow-ups and a clear funnel to booking.",
  metadataBase: new URL("https://callproai.in"),
  applicationName: "Call Pro AI",
  // Google Search Console ownership check for callproai.in. Not a secret: it is
  // a public meta tag. The env var still overrides it.
  verification: { google: process.env.NEXT_PUBLIC_GSC_VERIFICATION || GSC_DEFAULT },
  alternates: { languages: { "en-IN": "/", "x-default": "/" } },
  openGraph: { siteName: "Call Pro AI", locale: "en_IN", type: "website" },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-IN" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("admin-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`,
          }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
