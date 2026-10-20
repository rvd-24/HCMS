// Tiny, dependency-free motion helpers: scroll reveal and count-up numbers.
import clsx from "clsx";
import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** True once the element has scrolled into view (stays true). */
export function useInView<T extends Element>(options: IntersectionObserverInit = { threshold: 0.15 }) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") return setInView(true);
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        io.disconnect();
      }
    }, options);
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);
  return [ref, inView] as const;
}

export function Reveal({ children, delay = 0, className, as: Tag = "div" }: { children: ReactNode; delay?: number; className?: string; as?: ElementType }) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  return (
    <Tag ref={ref} className={clsx("reveal", inView && "is-visible", className)} style={{ "--delay": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** Animates from 0 to `value` the first time it's on screen, then follows value changes. */
export function CountUp({ value, duration = 1100, decimals = 0, className }: { value: number; duration?: number; decimals?: number; className?: string }) {
  const [ref, inView] = useInView<HTMLSpanElement>({ threshold: 0.3 });
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!inView) return;
    if (reducedMotion()) return setShown(value);
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setShown(origin + (value - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, duration]);
  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}
