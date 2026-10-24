import { useId } from "react";
import type { SeatBeamProps } from "./seat-beam-canvas";

import classes from "./seat-beam.module.css";

/** The shared turn clock drives the fill directly, including pause and expiry. */
export function SeatBeam({ active, size, borderWidth, progress, children }: SeatBeamProps) {
  const id = useId();
  if (!active || progress === undefined) return <>{children}</>;
  const centre = size / 2;
  const radius = Math.max(0, centre - borderWidth);
  const circumference = Math.PI * 2 * radius;

  return (
    <div className={classes.avatar} style={{ width: size, height: size }}>
      {children}
      <div
        aria-hidden="true"
        className={classes.fill}
        style={{
          inset: borderWidth,
          maskImage: `conic-gradient(black ${Math.min(1, Math.max(0, progress)) * 360}deg, transparent 0deg)`,
        }}
      />
      <svg aria-hidden="true" focusable="false" className={classes.rim} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={`${id}-rim`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0" stopColor="#ffd0ee" />
            <stop offset="0.3" stopColor="#ff59ba" />
            <stop offset="1" stopColor="#d20c83" />
          </linearGradient>
        </defs>
        <circle cx={centre} cy={centre} r={radius} fill="none" stroke="#741347" strokeWidth={7 * size / 68} />
        {[5, 1].map((width, index) => (
          <circle key={width} cx={centre} cy={centre} r={radius} fill="none"
          stroke={index === 0 ? `url(#${id}-rim)` : "#ffe1f3"}
          strokeOpacity={index === 0 ? 1 : 0.65}
          strokeLinecap="round"
          strokeWidth={width * size / 68}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, progress)))}
          transform={`rotate(-90 ${centre} ${centre})`}
          />
        ))}
      </svg>
    </div>
  );
}
