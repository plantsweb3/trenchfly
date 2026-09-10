import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#080b09" }}><svg width="53" height="53" viewBox="0 0 40 40" fill="#d7ff3f"><path d="M18 20 4 8l2 16 11 3m5-7L36 8l-2 16-11 3M20 17l-4 9 4 10 4-10-4-9Z" /><circle cx="16.5" cy="12" r="3.5" fill="#ff655d" /><circle cx="23.5" cy="12" r="3.5" fill="#ff655d" /></svg></div>, size);
}
