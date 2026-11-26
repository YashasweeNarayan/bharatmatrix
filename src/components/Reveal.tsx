"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fades a block in and moves it up slightly the first time it scrolls into
 * view. Content is visible by default (server render, no JavaScript, reduced
 * motion, or already on screen at load); the hidden starting state is only
 * applied after mount, to blocks that are still below the fold.
 */
export default function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  /** Stagger in milliseconds. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      return;
    }
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    el.setAttribute("data-reveal", "hidden");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.setAttribute("data-reveal", "shown");
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
