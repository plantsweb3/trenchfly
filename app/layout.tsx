import type { Metadata } from "next";
import { Silkscreen, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const pixel = Silkscreen({ variable: "--font-pixel", weight: ["400", "700"], subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", weight: ["400", "500", "600"], subsets: ["latin"] });
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", weight: ["400", "500", "600"], subsets: ["latin"] });

const title = `${SITE_NAME} — Small brain. Public record.`;
const description = "A fruit-fly connectome meets the market. Follow RobinFly’s public session, neural proposals, source frames, and wallet receipts on Robinhood Chain.";

export const metadata: Metadata = {
  metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
  title,
  description,
  alternates: SITE_URL ? { canonical: SITE_URL } : undefined,
  openGraph: { title, description, url: SITE_URL, siteName: SITE_NAME, type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${pixel.variable} ${plexMono.variable} ${plexSans.variable} antialiased`}>{children}</body></html>;
}
