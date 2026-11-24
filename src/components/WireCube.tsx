import type { CSSProperties } from "react";

/**
 * A slowly turning wireframe cube with hatched faces, drawn with plain CSS
 * 3D transforms (no WebGL, no extra packages). The same idea as the
 * template's 3D logo, but it follows the theme because every color is a
 * theme variable. Respects reduced motion (see globals.css).
 */
export default function WireCube({ size = 300 }: { size?: number }) {
  const half = size / 2;
  const faces = [
    `rotateY(0deg) translateZ(${half}px)`,
    `rotateY(90deg) translateZ(${half}px)`,
    `rotateY(180deg) translateZ(${half}px)`,
    `rotateY(-90deg) translateZ(${half}px)`,
    `rotateX(90deg) translateZ(${half}px)`,
    `rotateX(-90deg) translateZ(${half}px)`,
  ];
  const inner = size * 0.46;
  const ih = inner / 2;
  const innerFaces = faces.map((f) => f.replace(`${half}px`, `${ih}px`));

  const faceStyle = (transform: string, accent = false): CSSProperties => ({
    position: "absolute",
    inset: 0,
    transform,
    border: `1px solid rgb(var(--${accent ? "saffron-400" : "ink-600"}) / ${accent ? 0.7 : 1})`,
    backfaceVisibility: "visible",
  });

  return (
    <div
      aria-hidden
      style={{ width: size, height: size, perspective: size * 4 }}
      className="pointer-events-none select-none"
    >
      <div
        style={{
          width: size,
          height: size,
          position: "relative",
          transformStyle: "preserve-3d",
          animation: "bm-cube-spin 28s linear infinite",
        }}
      >
        {faces.map((t, i) => (
          <div key={i} className={i % 3 === 0 ? "bm-hatch-light" : ""} style={faceStyle(t)} />
        ))}
        <div
          style={{
            position: "absolute",
            left: (size - inner) / 2,
            top: (size - inner) / 2,
            width: inner,
            height: inner,
            transformStyle: "preserve-3d",
          }}
        >
          {innerFaces.map((t, i) => (
            <div key={i} style={faceStyle(t, true)} />
          ))}
        </div>
      </div>
    </div>
  );
}
