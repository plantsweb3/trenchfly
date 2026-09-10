import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "TRENCHFLY — a fly brain trading memecoins on Robinhood Chain";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#04070d",
          color: "#d7e4ee",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 24,
            border: "1px solid #12202f",
            display: "flex",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 90px",
            flex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: 8,
              color: "#64798c",
            }}
          >
            NEURAL REPLAY · LIVE · CHAIN 4663
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 110,
              fontWeight: 800,
              letterSpacing: 6,
              marginTop: 18,
            }}
          >
            <span style={{ color: "#d7e4ee" }}>TRENCH</span>
            <span style={{ color: "#ccf53d" }}>FLY</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              lineHeight: 1.4,
              color: "#8fa6b8",
              marginTop: 22,
              maxWidth: 700,
            }}
          >
            A fly brain with $100 and an EVM wallet, trading memecoin launches
            on Robinhood Chain.
          </div>
          <div
            style={{
              display: "flex",
              gap: 40,
              marginTop: 36,
              fontSize: 22,
              color: "#ccf53d",
              letterSpacing: 3,
            }}
          >
            <span>166,700 NEURONS</span>
            <span style={{ color: "#00c805" }}>PONS · LONG · O1</span>
            <span style={{ color: "#ff3b5c" }}>NO EXIT STRATEGY</span>
          </div>
        </div>
        <svg
          width="360"
          height="300"
          viewBox="0 0 360 300"
          style={{ position: "absolute", right: 60, top: 165 }}
        >
          <polygon
            points="186,124 146,106 98,98 54,102 30,114 26,126 46,136 96,138 146,136 182,132"
            fill="rgba(204,245,61,0.10)"
            stroke="#ccf53d"
            strokeWidth="2"
          />
          <polygon
            points="52,184 60,160 80,144 104,136 126,136 144,144 154,156 154,172 142,188 118,196 92,198 68,194"
            fill="#141a08"
            stroke="#ccf53d"
            strokeWidth="2.5"
          />
          <polygon
            points="146,158 150,138 162,124 180,118 198,122 210,134 212,150 206,164 190,172 170,172 154,168"
            fill="#141a08"
            stroke="#ccf53d"
            strokeWidth="2.5"
          />
          <polygon
            points="210,148 214,131 224,120 238,116 250,121 257,133 255,148 247,159 233,163 220,159"
            fill="#141a08"
            stroke="#ccf53d"
            strokeWidth="2.5"
          />
          <polygon
            points="232,121 247,123 255,134 253,148 242,157 230,151 227,134"
            fill="#ff3b5c"
            stroke="#ff6d86"
            strokeWidth="2"
          />
          <polyline
            points="198,166 222,196 232,228 244,242 258,246"
            fill="none"
            stroke="#ccf53d"
            strokeWidth="3"
          />
          <polyline
            points="182,172 196,206 192,238 198,252 210,255"
            fill="none"
            stroke="#ccf53d"
            strokeWidth="3"
          />
          <polyline
            points="158,170 140,204 132,238 120,252 106,255"
            fill="none"
            stroke="#ccf53d"
            strokeWidth="3"
          />
        </svg>
      </div>
    ),
    size,
  );
}
