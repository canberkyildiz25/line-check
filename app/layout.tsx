import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const display = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

const body = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Line Check · wet chemical pre-design for a cooking line",
  description:
    "Lay out a hood and a cooking line, and see which nozzles, how many flow numbers, which tanks and how many detectors the design limits call for. An independent study tool.",
  metadataBase: new URL("https://line-check-kitchen.vercel.app"),
  openGraph: {
    title: "Line Check",
    description: "Wet chemical pre-design for a commercial cooking line, drawn to scale.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#16181b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
