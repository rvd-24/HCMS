// Decorative anatomy illustration (DocuVerse-style). Purely visual — it encodes no patient data.
import { useId } from "react";

const mirror = (x: number) => 220 - x;

const LIMBS: { d: string; w: number }[] = [
  { d: "M56 118 L44 192", w: 24 },
  { d: "M44 192 L32 262", w: 19 },
  { d: `M${mirror(56)} 118 L${mirror(44)} 192`, w: 24 },
  { d: `M${mirror(44)} 192 L${mirror(32)} 262`, w: 19 },
  { d: "M90 284 L86 370", w: 34 },
  { d: "M86 370 L84 438", w: 24 },
  { d: `M${mirror(90)} 284 L${mirror(86)} 370`, w: 34 },
  { d: `M${mirror(86)} 370 L${mirror(84)} 438`, w: 24 },
];

const JOINTS: [number, number, boolean?][] = [
  [110, 40, true],
  [110, 86],
  [60, 112],
  [160, 112],
  [44, 192],
  [176, 192],
  [32, 262],
  [188, 262],
  [110, 128, true],
  [86, 132],
  [134, 132],
  [110, 200, true],
  [90, 284],
  [130, 284],
  [86, 370],
  [134, 370],
  [84, 436],
  [136, 436],
];

function Silhouette({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <g>
      <ellipse cx="110" cy="46" rx="26" ry="31" fill={fill} />
      <path d="M97 70 L123 70 L127 96 L93 96 Z" fill={fill} />
      <circle cx="60" cy="114" r="18" fill={fill} />
      <circle cx="160" cy="114" r="18" fill={fill} />
      <path
        d="M62 100 C80 90 140 90 158 100 C168 106 170 120 166 140 L158 196 C154 222 146 240 140 252 L80 252 C74 240 66 222 62 196 L54 140 C50 120 52 106 62 100 Z"
        fill={fill}
      />
      <path d="M76 244 L144 244 L152 282 C142 300 124 304 110 304 C96 304 78 300 68 282 Z" fill={fill} />
      {LIMBS.map((l) => (
        <path key={l.d} d={l.d} stroke={stroke} strokeWidth={l.w} strokeLinecap="round" fill="none" />
      ))}
      <ellipse cx="29" cy="282" rx="10" ry="17" fill={fill} transform="rotate(8 29 282)" />
      <ellipse cx="191" cy="282" rx="10" ry="17" fill={fill} transform="rotate(-8 191 282)" />
      <ellipse cx="80" cy="448" rx="17" ry="8" fill={fill} />
      <ellipse cx="140" cy="448" rx="17" ry="8" fill={fill} />
    </g>
  );
}

export function BodyFigure({ className, scan = true }: { className?: string; scan?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 220 480" className={className} aria-hidden>
      <defs>
        <linearGradient id={`body-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a9bdb4" />
          <stop offset="100%" stopColor="#7d958a" />
        </linearGradient>
        <linearGradient id={`green-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#39bb80" />
          <stop offset="100%" stopColor="#148653" />
        </linearGradient>
        <linearGradient id={`lime-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eefabf" />
          <stop offset="100%" stopColor="#d2ec5c" />
        </linearGradient>
        <linearGradient id={`scan-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6dd3a3" stopOpacity="0" />
          <stop offset="85%" stopColor="#6dd3a3" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.95" />
        </linearGradient>
        <radialGradient id={`floor-${id}`}>
          <stop offset="0%" stopColor="#b9c6cf" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#dfe6ec" stopOpacity="0" />
        </radialGradient>
        <mask id={`mask-${id}`}>
          <Silhouette fill="#fff" stroke="#fff" />
        </mask>
      </defs>

      {/* floor + orbit */}
      <ellipse cx="110" cy="452" rx="104" ry="20" fill={`url(#floor-${id})`} />
      <ellipse
        cx="110"
        cy="452"
        rx="92"
        ry="15"
        fill="none"
        stroke="#1ea468"
        strokeOpacity="0.35"
        strokeWidth="1.2"
        strokeDasharray="4 6"
        className="animate-dash"
      />

      <g>
        <Silhouette fill={`url(#body-${id})`} stroke="#8ea69b" />
        {/* soft white outline highlights between muscle groups */}
        <path d="M110 100 L110 244" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.5" />
        {/* traps */}
        <path d="M86 98 L110 104 L134 98 L124 112 L96 112 Z" fill={`url(#lime-${id})`} />
        {/* pecs */}
        <path d="M70 114 C84 106 104 108 108 114 L108 148 C96 156 78 154 68 146 Z" fill={`url(#green-${id})`} />
        <path d="M150 114 C136 106 116 108 112 114 L112 148 C124 156 142 154 152 146 Z" fill={`url(#green-${id})`} />
        {/* abs */}
        <path d="M86 156 L134 156 L128 226 L110 244 L92 226 Z" fill={`url(#lime-${id})`} />
        <path d="M88 180 H132 M90 204 H130 M110 156 V240" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.5" />
        {/* obliques */}
        <path d="M70 156 L84 158 L90 222 L78 214 Z" fill={`url(#green-${id})`} opacity="0.85" />
        <path d="M150 156 L136 158 L130 222 L142 214 Z" fill={`url(#green-${id})`} opacity="0.85" />
      </g>

      {scan && (
        <g mask={`url(#mask-${id})`}>
          <rect x="0" width="220" height="70" fill={`url(#scan-${id})`}>
            <animate attributeName="y" values="-70;470" dur="4.5s" repeatCount="indefinite" />
          </rect>
        </g>
      )}

      {JOINTS.map(([x, y, pulse], i) => (
        <g key={i}>
          {pulse && (
            <circle
              cx={x}
              cy={y}
              r="5"
              fill="#ffffff"
              className="animate-pulse-ring"
              style={{ transformBox: "fill-box", transformOrigin: "center", animationDelay: `${i * 0.25}s` }}
            />
          )}
          <circle cx={x} cy={y} r="4" fill="#ffffff" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="3" />
        </g>
      ))}
    </svg>
  );
}
