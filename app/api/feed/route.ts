import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FEED_URL =
  "https://raw.githubusercontent.com/plantsweb3/trenchfly/feed/latest.json";

export async function GET() {
  try {
    const res = await fetch(FEED_URL, { next: { revalidate: 30 } });
    if (!res.ok) return NextResponse.json({ session: null });
    const json = await res.json();
    return NextResponse.json({ session: json });
  } catch {
    return NextResponse.json({ session: null });
  }
}
