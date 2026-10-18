import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/*
 * The dashboard's decorative pieces (see src/lib/dashboard-motion.ts). Each is
 * only mounted while motion is on, so none of them has to check again.
 */

/** How far down the page the viewer is, from 0 to 1, updated once a frame. */
function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const run = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
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
  }, []);
  return progress;
}

/**
 * A thin bar across the top of the window that fills as the page scrolls.
 * Portalled to `body`: the page is wrapped in PageTurn, whose transform would
 * otherwise become the containing block for this fixed element mid-turn.
 */
export function ScrollProgressBar() {
  const progress = useScrollProgress();
  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-primary via-amber-300 to-rose-400"
      style={{ transform: `scaleX(${progress})`, top: "env(safe-area-inset-top, 0px)" }}
    />,
    document.body,
  );
}

/**
 * Back to the top, with a ring that fills as the page scrolls. Desktop only:
 * on a phone the bottom right corner already holds the menu button.
 */
export function BackToTop() {
  const progress = useScrollProgress();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const check = () => setShown(window.scrollY > 700);
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);
  const circumference = 2 * Math.PI * 24;

  return createPortal(
    <button
      type="button"
      aria-label="Back to top"
      tabIndex={shown ? 0 : -1}
      aria-hidden={!shown}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed bottom-6 right-6 z-40 hidden h-[52px] w-[52px] items-center justify-center rounded-full bg-card text-foreground shadow-lg transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex ${
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <svg viewBox="0 0 52 52" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="26" cy="26" r="24" fill="none" strokeWidth="3" className="stroke-border" />
        <circle
          cx="26"
          cy="26"
          r="24"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className="stroke-primary"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <ArrowUp className="h-4 w-4" aria-hidden="true" />
    </button>,
    document.body,
  );
}

/**
 * Soft coloured light drifting behind the hero. Only for a hero with no
 * photograph of its own: over a photograph it would tint somebody's picture.
 */
export function HeroAurora() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -inset-[20%] mix-blend-screen">
      <span className="dfx-aurora absolute left-[48%] top-[10%] h-[60%] w-[46%] rounded-full bg-amber-400/70 blur-3xl" />
      <span className="dfx-aurora dfx-aurora-2 absolute left-[62%] top-[40%] h-[55%] w-[40%] rounded-full bg-rose-500/60 blur-3xl" />
      <span className="dfx-aurora dfx-aurora-3 absolute left-[30%] top-[50%] h-[50%] w-[38%] rounded-full bg-teal-400/50 blur-3xl" />
    </div>
  );
}

/**
 * A heading's text, a word at a time (`.dfx-word`). The words are hidden from
 * screen readers, so the heading itself must carry the text as `aria-label`.
 */
export function RisingWords({ text }: { text: string }) {
  return (
    <span aria-hidden="true">
      {text.split(/\s+/).map((word, index) => (
        <span key={`${word}-${index}`}>
          {index > 0 ? " " : null}
          <span className="dfx-word" style={{ ["--i" as string]: index }}>
            {word}
          </span>
        </span>
      ))}
    </span>
  );
}

type Ember = { x: number; y: number; speed: number; radius: number; alpha: number; wobble: number };

/**
 * Small warm embers rising through the right of the hero, like sparks off a
 * diya. Drawn on a canvas, and only while the hero is on screen and the tab
 * is visible - off screen it costs nothing.
 */
export function HeroEmbers() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let embers: Ember[] = [];
    let frame = 0;
    let visible = true;

    const size = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    const draw = () => {
      frame = 0;
      if (!visible || document.hidden) return;
      const dpr = window.devicePixelRatio || 1;
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (embers.length < 36 && Math.random() < 0.3) {
        embers.push({
          x: canvas.width * (0.45 + Math.random() * 0.55),
          y: canvas.height + 5,
          speed: (0.4 + Math.random() * 0.8) * dpr,
          radius: (1 + Math.random() * 1.8) * dpr,
          alpha: 0,
          wobble: Math.random() * 6,
        });
      }
      context.shadowColor = "rgba(255,190,90,0.9)";
      context.shadowBlur = 8 * dpr;
      for (const ember of embers) {
        ember.y -= ember.speed;
        ember.wobble += 0.03;
        ember.x += Math.sin(ember.wobble) * 0.4;
        ember.alpha = Math.min(1, ember.alpha + 0.02) * (ember.y > canvas.height * 0.2 ? 1 : 0.95);
        context.beginPath();
        context.fillStyle = `rgba(255,214,140,${ember.alpha * 0.8})`;
        context.arc(ember.x, ember.y, ember.radius, 0, Math.PI * 2);
        context.fill();
      }
      embers = embers.filter((ember) => ember.y > -10 && ember.alpha > 0.02);
      frame = requestAnimationFrame(draw);
    };
    const resume = () => {
      if (!frame && visible && !document.hidden) frame = requestAnimationFrame(draw);
    };

    size();
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      resume();
    });
    observer.observe(canvas);
    window.addEventListener("resize", size);
    document.addEventListener("visibilitychange", resume);
    resume();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", size);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
