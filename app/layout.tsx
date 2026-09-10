import type { Metadata } from "next";
import { Silkscreen, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const pixel = Silkscreen({
  variable: "--font-pixel",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://trenchfly.xyz"),
  title: "TRENCHFLY — a fly brain trading memecoins on Robinhood Chain",
  description:
    "166,700 neurons. 25.1 million synapses. $100 and an EVM wallet. The fly watches Pons, long.xyz and o1 launches on Robinhood Chain; its motor neurons sign the orders. Profitable learning has not been demonstrated.",
  openGraph: {
    title: "TRENCHFLY",
    description:
      "A fly connectome with $100 and an EVM wallet, trading memecoin launches on Robinhood Chain. Every order starts as motor-neuron spikes.",
    url: "https://trenchfly.xyz",
    siteName: "TRENCHFLY",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TRENCHFLY",
    description:
      "A fly connectome with $100 and an EVM wallet, trading memecoin launches on Robinhood Chain.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${pixel.variable} ${plexMono.variable} ${plexSans.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
