// Hand-plotted low-poly wireframe fly, side profile, facing right, wings
// at rest swept back. Wings render behind the body so the silhouette reads
// body-first. `phone` seats it over a Robinhood-green phone slab with a
// front foot on the screen.

export default function FlySvg({
  phone = false,
  className = "",
}: {
  phone?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 360 300"
      className={className}
      role="img"
      aria-label="Wireframe fly standing over a phone"
    >
      <defs>
        <radialGradient id="eyeGrad" cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#ff8ba0" />
          <stop offset="45%" stopColor="#ff3b5c" />
          <stop offset="100%" stopColor="#7a0f24" />
        </radialGradient>
        <linearGradient id="wingGrad" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="rgba(204,245,61,0.14)" />
          <stop offset="100%" stopColor="rgba(204,245,61,0.03)" />
        </linearGradient>
        <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#28320f" />
          <stop offset="55%" stopColor="#141a08" />
          <stop offset="100%" stopColor="#0a0d04" />
        </linearGradient>
      </defs>

      {phone && (
        <g>
          <polygon
            points="210,238 332,226 356,252 236,266"
            fill="#0a1410"
            stroke="#1f4433"
            strokeWidth="1.5"
          />
          <polygon
            points="224,240 324,231 342,250 244,258"
            fill="#04160c"
            stroke="#00c805"
            strokeWidth="1"
            opacity="0.9"
          />
          <polyline
            points="234,251 250,247 262,250 276,243 290,246 306,238 320,241"
            fill="none"
            stroke="#00c805"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle cx="320" cy="241" r="2.4" fill="#00c805">
            <animate
              attributeName="opacity"
              values="1;0.2;1"
              dur="1.4s"
              repeatCount="indefinite"
            />
          </circle>
        </g>
      )}

      {/* ground shadow */}
      <ellipse cx="170" cy="258" rx="115" ry="9" fill="rgba(204,245,61,0.06)" />

      <g
        className="anim-float"
        style={{ filter: "drop-shadow(0 0 7px rgba(204,245,61,0.28))" }}
      >
        {/* ---- far legs (behind everything) ---- */}
        <g
          stroke="#7f9a28"
          strokeWidth="2.2"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.55"
        >
          <polyline points="206,162 226,188 240,220 252,230" />
          <polyline points="176,170 166,204 162,238 172,246" />
          <polyline points="154,166 128,196 114,230 100,240" />
        </g>

        {/* ---- wings: swept back at rest, drawn BEHIND the body ---- */}
        <g className="wing-b" opacity="0.4">
          <polygon
            points="188,134 146,118 100,112 58,118 36,130 34,140 54,146 100,146 148,144 184,140"
            fill="url(#wingGrad)"
            stroke="#ccf53d"
            strokeWidth="0.9"
          />
        </g>
        <g className="wing-a">
          <polygon
            points="186,124 146,106 98,98 54,102 30,114 26,126 46,136 96,138 146,136 182,132"
            fill="url(#wingGrad)"
            stroke="#ccf53d"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* veins — kept to the wing so the body stays clean */}
          <g stroke="#ccf53d" strokeWidth="0.7" opacity="0.5">
            <line x1="184" y1="126" x2="28" y2="124" />
            <line x1="182" y1="124" x2="50" y2="106" />
            <line x1="182" y1="129" x2="44" y2="135" />
            <line x1="118" y1="100" x2="110" y2="137" />
            <line x1="70" y1="103" x2="64" y2="136" />
          </g>
        </g>

        {/* ---- abdomen: plump teardrop, solid, minimal interior ---- */}
        <polygon
          points="52,184 60,160 80,144 104,136 126,136 144,144 154,156 154,172 142,188 118,196 92,198 68,194"
          fill="url(#bodyGrad)"
          stroke="#ccf53d"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <g stroke="#ccf53d" strokeWidth="0.8" opacity="0.28">
          <path d="M 86 140 Q 82 168 84 195" fill="none" />
          <path d="M 108 136 Q 105 168 106 197" fill="none" />
          <path d="M 128 137 Q 126 166 126 194" fill="none" />
        </g>

        {/* ---- thorax: compact hump, overlaps abdomen ---- */}
        <polygon
          points="146,158 150,138 162,124 180,118 198,122 210,134 212,150 206,164 190,172 170,172 154,168"
          fill="url(#bodyGrad)"
          stroke="#ccf53d"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <g stroke="#ccf53d" strokeWidth="0.8" opacity="0.25">
          <line x1="162" y1="124" x2="184" y2="172" />
          <line x1="196" y1="121" x2="172" y2="172" />
        </g>
        {/* dorsal bristles */}
        <g stroke="#ccf53d" strokeWidth="1" opacity="0.55" strokeLinecap="round">
          <line x1="164" y1="123" x2="160" y2="113" />
          <line x1="176" y1="118" x2="174" y2="107" />
          <line x1="190" y1="119" x2="193" y2="108" />
          <line x1="202" y1="126" x2="207" y2="117" />
        </g>

        {/* haltere */}
        <line
          x1="152"
          y1="164"
          x2="143"
          y2="157"
          stroke="#ccf53d"
          strokeWidth="1"
          opacity="0.6"
        />
        <circle cx="141" cy="155" r="2.4" fill="#ccf53d" opacity="0.6" />

        {/* ---- head: round, tucked against thorax ---- */}
        <polygon
          points="210,148 214,131 224,120 238,116 250,121 257,133 255,148 247,159 233,163 220,159"
          fill="url(#bodyGrad)"
          stroke="#ccf53d"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        {/* antennae: tiny stubs drooping from the front of the face */}
        <g
          stroke="#ccf53d"
          strokeWidth="1.2"
          fill="none"
          opacity="0.75"
          strokeLinecap="round"
        >
          <polyline points="253,138 259,142 261,147" />
          <polyline points="254,131 261,133" />
        </g>
        {/* proboscis: short, no flourish */}
        <polyline
          points="238,161 241,169 239,175"
          fill="none"
          stroke="#ccf53d"
          strokeWidth="1.6"
          opacity="0.8"
          strokeLinecap="round"
        />

        {/* ---- eye: faceted red, the focal point ---- */}
        <polygon
          points="232,121 247,123 255,134 253,148 242,157 230,151 227,134"
          fill="url(#eyeGrad)"
          stroke="#ff6d86"
          strokeWidth="1"
          style={{ filter: "drop-shadow(0 0 7px rgba(255,59,92,0.7))" }}
        />
        <g stroke="rgba(255,180,195,0.4)" strokeWidth="0.6">
          <line x1="232" y1="121" x2="242" y2="157" />
          <line x1="227" y1="134" x2="253" y2="148" />
          <line x1="247" y1="123" x2="230" y2="151" />
        </g>
        <circle cx="238" cy="131" r="2.4" fill="rgba(255,220,228,0.85)" />

        {/* ---- near legs: femur → knee → tibia → tarsus ---- */}
        <g
          stroke="#ccf53d"
          strokeWidth="2.6"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <polyline points="198,166 222,196 232,228 244,242 258,246" />
          <polyline points="182,172 196,206 192,238 198,252 210,255" />
          <polyline points="158,170 140,204 132,238 120,252 106,255" />
        </g>
        <g fill="#ccf53d" opacity="0.9">
          <circle cx="222" cy="196" r="2.2" />
          <circle cx="232" cy="228" r="1.8" />
          <circle cx="196" cy="206" r="2.2" />
          <circle cx="192" cy="238" r="1.8" />
          <circle cx="140" cy="204" r="2.2" />
          <circle cx="132" cy="238" r="1.8" />
        </g>
      </g>
    </svg>
  );
}
