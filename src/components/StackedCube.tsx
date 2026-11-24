import type { CSSProperties } from "react";

/**
 * The block from the Lovable template: three flat boxes stacked with a small
 * offset, turning slowly, drawn as outlined boxes with fine horizontal
 * stripes. Plain CSS 3D (no WebGL / extra packages); colors come from the
 * theme variables so it works in light and dark. Same proportions as the
 * template (each box 0.7 x 0.35 x 0.7, tiers at +0.5 / 0 / -0.5, offset 0.12).
 */
export default function StackedCube({ size = 300 }: { size?: number }) {
  const w = 0.7 * size;
  const h = 0.35 * size;
  const tiers = [0.5, 0, -0.5];

  const face = (width: number, height: number, transform: string): CSSProperties => ({
    position: "absolute",
    width,
    height,
    left: -width / 2,
    top: -height / 2,
    transform,
    border: "1px solid rgb(var(--ink-600))",
    // Opaque like the template's boxes, so the back edges stay hidden.
    backgroundColor: "rgb(var(--ink-950))",
    backgroundImage:
      "repeating-linear-gradient(0deg, rgb(var(--ink-600) / 0.45) 0, rgb(var(--ink-600) / 0.45) 1px, transparent 1px, transparent 4px)",
  });

  return (
    <div
      aria-hidden
      className="pointer-events-none select-none"
      style={{ width: size * 1.4, height: size * 1.6, perspective: size * 6 }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 0,
          height: 0,
          transformStyle: "preserve-3d",
          animation: "bm-cube-spin 26s linear infinite",
        }}
      >
        {tiers.map((y, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 0,
              height: 0,
              transformStyle: "preserve-3d",
              transform: `translate3d(${i * 0.12 * size}px, ${-y * size}px, ${-i * 0.12 * size}px)`,
            }}
          >
            <div style={face(w, h, `translateZ(${w / 2}px)`)} />
            <div style={face(w, h, `rotateY(180deg) translateZ(${w / 2}px)`)} />
            <div style={face(w, h, `rotateY(90deg) translateZ(${w / 2}px)`)} />
            <div style={face(w, h, `rotateY(-90deg) translateZ(${w / 2}px)`)} />
            <div style={face(w, w, `rotateX(90deg) translateZ(${h / 2}px)`)} />
            <div style={face(w, w, `rotateX(-90deg) translateZ(${h / 2}px)`)} />
          </div>
        ))}
      </div>
    </div>
  );
}
