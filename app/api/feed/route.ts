import { NextResponse } from "next/server";

const FEED_URL =
  "https://raw.githubusercontent.com/plantsweb3/trenchfly/feed/latest.json";

export async function GET() {
  try {
    const res = await fetch(FEED_URL, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return NextResponse.json({ session: null });
    const json = await res.json();
    return NextResponse.json({ session: json });
  } catch {
    return NextResponse.json({ session: null });
  }
}
