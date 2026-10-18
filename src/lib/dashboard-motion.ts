import { useEffect, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { usePrefersReducedMotion } from "@/lib/motion";

/**
 * The dashboard's motion layer: scroll reveals, scroll-linked drawing, tilt,
 * magnetic buttons, confetti. Everything here is decoration on top of a page
 * that is complete without it - nothing waits on an animation to be readable,
 * and anything hidden for a reveal is only ever something below the first
 * screen, so a thumbnail or a skim sees the whole page.
 *
 * One switch turns all of it off. `prefers-reduced-motion` turns it off for
 * that person, whatever the switch says.
 */
export const DASHBOARD_MOTION = true;

export function useDashboardMotion() {
  const reduced = usePrefersReducedMotion();
  return DASHBOARD_MOTION && !reduced;
}

export type RevealStyle = "up" | "left" | "clip";

/**
 * Children of `ref` that are below the first screen start hidden and slide in
 * as they are scrolled to. Children already on screen are never touched, and
 * children added later (widgets arrive as their data does) are picked up by
 * the same rules. With motion off it does nothing at all.
 */
export function useScrollReveal(ref: RefObject<HTMLElement>, enabled: boolean, style: RevealStyle = "up") {
  useEffect(() => {
    const container = ref.current;
    if (!enabled || !container || typeof IntersectionObserver === "undefined") return;

    const seen = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          entry.target.classList.remove("dfx-pending");
          entry.target.classList.add("dfx-in");
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );

    const consider = (el: Element) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
      el.setAttribute("data-dfx", style);
      el.classList.add("dfx-pending");
      observer.observe(el);
    };

    Array.from(container.children).forEach(consider);
    const mutations = new MutationObserver(() => Array.from(container.children).forEach(consider));
    mutations.observe(container, { childList: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
      // Never leave anything hidden behind when the effect goes away.
      Array.from(container.children).forEach((el) => el.classList.remove("dfx-pending"));
    };
  }, [ref, enabled, style]);
}

/**
 * Calls `onFrame` with the element's box at most once a frame while the page
 * scrolls or resizes, and once straight away. Used for anything drawn from
 * the scroll position: the hero's parallax, the schedule's line.
 */
export function useScrollFrame(ref: RefObject<HTMLElement>, enabled: boolean, onFrame: (box: DOMRect) => void) {
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    let frame = 0;
    const run = () => {
      frame = 0;
      onFrame(el.getBoundingClientRect());
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };
    run();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ref, enabled, onFrame]);
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
export { clamp as clamp01 };

/**
 * A tile that leans towards the mouse, with a soft light under the cursor
 * (`.dfx-spot` draws the light from `--mx` / `--my`). Mouse only: on a touch
 * screen a tilt would fight the scroll and there is no cursor to follow.
 */
export function tiltHandlers(enabled: boolean, strength = 1) {
  if (!enabled) return {};
  return {
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== "mouse") return;
      const el = event.currentTarget;
      const box = el.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      el.style.setProperty("--mx", `${x * 100}%`);
      el.style.setProperty("--my", `${y * 100}%`);
      el.style.transform = `perspective(700px) rotateX(${(0.5 - y) * 7 * strength}deg) rotateY(${(x - 0.5) * 9 * strength}deg) translateY(-2px)`;
    },
    onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => {
      event.currentTarget.style.transform = "";
    },
  };
}

/** A button that drifts a little towards the mouse. Mouse only, like the tilt. */
export function magneticHandlers(enabled: boolean) {
  if (!enabled) return {};
  return {
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== "mouse") return;
      const el = event.currentTarget;
      const box = el.getBoundingClientRect();
      el.style.transform = `translate(${(event.clientX - box.left - box.width / 2) * 0.2}px, ${(event.clientY - box.top - box.height / 2) * 0.28}px)`;
    },
    onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => {
      event.currentTarget.style.transform = "";
    },
  };
}

const confettiColours = ["#F6BE60", "#FFE4A0", "#E0526F", "#2A8A8E", "#FFFFFF"];

/**
 * A burst of confetti from the middle of `from`, on a canvas laid over the
 * whole window and removed when the last piece has fallen. It lives on
 * `document.body`, so it carries on across the route change a button may
 * start, and it never takes a click.
 */
export function fireConfetti(from: Element) {
  if (typeof document === "undefined") return;
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:100";
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return;
  }

  const box = from.getBoundingClientRect();
  const originX = (box.left + box.width / 2) * dpr;
  const originY = (box.top + box.height / 2) * dpr;
  let pieces = Array.from({ length: 150 }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = (6 + Math.random() * 11) * dpr;
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: Math.random() * 3,
      spin: (Math.random() - 0.5) * 0.4,
      width: (5 + Math.random() * 6) * dpr,
      height: (8 + Math.random() * 8) * dpr,
      colour: confettiColours[index % confettiColours.length],
      life: 1,
    };
  });

  const step = () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const piece of pieces) {
      piece.vy += 0.35 * dpr;
      piece.vx *= 0.985;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.rotation += piece.spin;
      piece.life -= 0.009;
      context.save();
      context.globalAlpha = Math.max(0, piece.life);
      context.translate(piece.x, piece.y);
      context.rotate(piece.rotation);
      context.fillStyle = piece.colour;
      context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
      context.restore();
    }
    pieces = pieces.filter((piece) => piece.life > 0 && piece.y < canvas.height + 40);
    if (pieces.length) requestAnimationFrame(step);
    else canvas.remove();
  };
  requestAnimationFrame(step);
}
