"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import Link from "next/link";
import "./cinematic.css";

const TOTAL_VH = 640;
const TRAVEL_VH = TOTAL_VH - 100; // how far you scroll while the stage is pinned
// Where one scene hands over to the next (0..1 of the pinned scroll).
const B = [0, 0.21, 0.43, 0.65, 0.85, 1];
const QUESTION = "What were the total borrowings at year end?";

const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));
const css = (v: Record<string, string | number>) => v as CSSProperties;

const CELLS: { text: string; conflict?: boolean }[] = [
  { text: "₹4,210 cr" }, { text: "₹4,210 cr" }, { text: "₹4,198 cr" }, { text: "₹4,210 cr" },
  { text: "₹1,284.6", conflict: true }, { text: "₹1,284.6" }, { text: "₹1,248.6", conflict: true }, { text: "₹1,284.6" },
  { text: "17.0%" }, { text: "17.0%" }, { text: "17.0%" }, { text: "17.1%" },
];

export default function Cinematic({
  ctaHref,
  ctaLabel,
}: {
  ctaHref: string;
  ctaLabel: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const typed = useRef<HTMLSpanElement>(null);
  const cta = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const travel = r.height - window.innerHeight;
      const p = clamp(travel > 0 ? -r.top / travel : 0);
      el.style.setProperty("--p", p.toFixed(4));

      const ins = B.map((b) => clamp((p - (b - 0.02)) / 0.04));
      let best = 0;
      let bestO = -1;
      for (let i = 0; i < 5; i++) {
        const enter = i === 0 ? 1 : ins[i];
        const leave = i === 4 ? 0 : ins[i + 1];
        const o = enter * (1 - leave);
        const t = clamp((p - B[i]) / (B[i + 1] - B[i]));
        el.style.setProperty(`--o${i + 1}`, o.toFixed(3));
        el.style.setProperty(`--t${i + 1}`, t.toFixed(4));
        if (o > bestO) { bestO = o; best = i; }
      }

      if (typed.current) {
        const t2 = clamp((p - B[1]) / (B[2] - B[1]));
        const n = Math.floor(clamp(t2 * 2.2) * QUESTION.length);
        if (typed.current.textContent?.length !== n) typed.current.textContent = QUESTION.slice(0, n);
      }
      if (cta.current) {
        const o5 = clamp(ins[4]);
        cta.current.style.visibility = o5 > 0.4 ? "visible" : "hidden";
      }
      if (rail.current) {
        const inView = r.top < 0 && r.bottom > window.innerHeight * 0.5;
        rail.current.classList.toggle("cin-show", inView);
        Array.from(rail.current.children).forEach((c, i) => {
          if (i === best) c.setAttribute("data-on", "");
          else c.removeAttribute("data-on");
        });
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const at = (frac: number) => `${(frac * TRAVEL_VH).toFixed(0)}vh`;

  return (
    <div ref={root} className="cin cin-bars" style={{ height: `${TOTAL_VH}vh` }}>
      <span id="what" className="cin-anchor" style={{ top: 0 }} />
      <span id="ask" className="cin-anchor" style={{ top: at(0.24) }} />
      <span id="telegram" className="cin-anchor" style={{ top: at(0.88) }} />

      <div className="cin-stage">
        <div className="cin-caps">
          <div className="cin-cap" style={css({ "--o": "var(--o1)" })}>
            <h1>Read every document. Trust every answer.</h1>
            <p>Upload annual reports, investor decks and audits. Ask one question across all of them, and see the exact line it came from.</p>
          </div>
          <div className="cin-cap" style={css({ "--o": "var(--o2)" })}>
            <h2>Ask once. <em>Search everything.</em></h2>
            <p>One question runs across every document you uploaded, tables and numbers included. If the answer isn&apos;t in them, it says so.</p>
          </div>
          <div className="cin-cap" style={css({ "--o": "var(--o3)" })}>
            <h2>When documents disagree, <em>it tells you.</em></h2>
            <p>The same question goes to every document in a grid, so a changed figure stands out instead of hiding on page 84.</p>
          </div>
          <div className="cin-cap" style={css({ "--o": "var(--o4)" })}>
            <h2>Two keys for <em>your files.</em></h2>
            <p>Administrators can review conversations to support the service. Opening anyone&apos;s uploaded files takes two administrators, together.</p>
          </div>
          <div className="cin-cap" style={css({ "--o": "var(--o5)" })}>
            <h2>Ask from <em>your pocket.</em></h2>
            <p>Link Telegram once with a short code, then message a question from anywhere. Same answer, same quoted source.</p>
            <div className="cin-cta cin-live">
              <Link ref={cta} href={ctaHref} className="cin-btn-solid" style={{ visibility: "hidden" }}>
                {ctaLabel}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            </div>
          </div>
        </div>

        <div className="cin-vis" aria-hidden>
          {/* 1: documents */}
          <div className="cin-scene" style={css({ "--o": "var(--o1)" })}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cin-doc" style={css({ "--i": i })}>
                <b /><span /><span /><span /><span /><span /><u />
              </div>
            ))}
          </div>

          {/* 2: question + evidence */}
          <div className="cin-scene" style={css({ "--o": "var(--o2)" })}>
            <div className="cin-q"><span ref={typed} /><i className="cin-caret" /></div>
            <div className="cin-beam" />
            <div className="cin-rows">
              {["Annual_Report_2025.pdf", "Investor_Deck.pdf", "Rating_Rationale.pdf", "Audit_Report.pdf"].map((n, i) => (
                <div key={n} className="cin-row" {...(i !== 2 ? { "data-skip": "" } : {})}>
                  <span>{n}</span><i />
                  {i === 2 && (
                    <>
                      <div className="cin-hit" />
                      <div className="cin-quote">
                        &ldquo;Total borrowings stood at ₹4,210 crore at year end.&rdquo;
                        <small>Rating_Rationale.pdf · page 84</small>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 3: matrix */}
          <div className="cin-scene" style={css({ "--o": "var(--o3)" })}>
            <div className="cin-grid">
              {CELLS.map((c, k) => (
                <div key={k} className="cin-cell" style={css({ "--k": k })} {...(c.conflict ? { "data-conflict": "" } : {})}>
                  {c.text}
                </div>
              ))}
            </div>
            <div className="cin-flag">⚠ Conflict: two documents report different revenue</div>
          </div>

          {/* 4: two keys */}
          <div className="cin-scene" style={css({ "--o": "var(--o4)" })}>
            <div className="cin-vault"><div className="cin-shackle" /><div className="cin-body" /></div>
            <div className="cin-key a" />
            <div className="cin-key b" />
            <div className="cin-count"><b>2 of 2</b> admins approved</div>
          </div>

          {/* 5: phone */}
          <div className="cin-scene" style={css({ "--o": "var(--o5)" })}>
            <div className="cin-phone">
              <div className="cin-msg me" style={css({ "--at": 0.05 })}>What was the total debt at year end?</div>
              <div className="cin-msg bot" style={css({ "--at": 0.3 })}>Total borrowings were ₹4,210 crore.<small>grounded · Annual report, p. 84</small></div>
              <div className="cin-msg me" style={css({ "--at": 0.5 })}>Do the filing and the deck agree on revenue?</div>
              <div className="cin-msg bot" style={css({ "--at": 0.7 })}>No. ₹1,284.6 crore vs ₹1,248.6 crore.<small>conflict flagged</small></div>
            </div>
          </div>
        </div>
      </div>

      <div ref={rail} className="cin-rail" aria-hidden>
        <i /><i /><i /><i /><i />
      </div>
    </div>
  );
}
