import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#04070d",
          border: "1px solid #ccf53d",
        }}
      >
        <svg width="26" height="26" viewBox="0 0 26 26">
          <polygon
            points="4,16 8,10 14,9 18,12 18,17 13,20 7,20"
            fill="rgba(204,245,61,0.15)"
            stroke="#ccf53d"
            strokeWidth="1.4"
          />
          <polygon
            points="16,8 23,10 24,15 20,18 16,15"
            fill="#ff3b5c"
          />
          <polyline
            points="17,5 8,1"
            fill="none"
            stroke="#ccf53d"
            strokeWidth="1.2"
          />
        </svg>
      </div>
    ),
    size,
  );
}
