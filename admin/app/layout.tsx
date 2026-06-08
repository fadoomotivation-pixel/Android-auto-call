import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SalesAutoCall — Admin",
  description: "Company, salespeople, contacts and call-log visibility for the cloud.",
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
