import type { Metadata } from "next";
import { dmSans, robotoMono } from "@/font";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Annex",
  description: "Annex webapp for account management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${robotoMono.variable} font-(family-name:--font-dm-sans) antialiased bg-annex-black text-annex-white`}
      >
        {children}
      </body>
    </html>
  );
}
