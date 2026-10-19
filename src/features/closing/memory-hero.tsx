import bundledPhotoUrl from "../dashboard/bg-image.jpeg";
import { useCallback, useRef } from "react";
import { HeroEmbers, RisingWords } from "@/components/shared/dashboard-fx";
import { clamp01, useDashboardMotion, useScrollFrame } from "@/lib/dashboard-motion";
import type { AppEvent } from "@/lib/event-data";
import { heroPhotoStyle } from "@/lib/hero";
import { artworkKeyFor, heroArtworkUrl, usesBundledPhoto } from "@/lib/hero-artwork";

/**
 * The banner a closed event opens with on its closing page: it is a memory now.
 *
 * The same picture the event's hero uses - the organiser's photograph, the
 * bundled one for the event that predates templates, else its artwork - under
 * the same left-weighted scrim, so the white text keeps its contrast. With
 * motion on, the name rises in a word at a time over drifting embers, and the
 * picture sinks and grows a little as the page scrolls past it. At rest
 * nothing is set; with reduced motion it is a still banner.
 */
export function MemoryHero({ event }: { event: AppEvent }) {
  const motion = useDashboardMotion();
  const frameRef = useRef<HTMLElement>(null);
  const pictureRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);

  const onFrame = useCallback((box: DOMRect) => {
    const progress = clamp01(-box.top / box.height);
    const picture = pictureRef.current;
    const copy = copyRef.current;
    if (!picture || !copy) return;
    if (progress === 0) {
      picture.style.transform = "";
      copy.style.opacity = "";
      return;
    }
    picture.style.transform = `translateY(${progress * 30}px) scale(${1 + progress * 0.18})`;
    copy.style.opacity = String(1 - progress * 0.8);
  }, []);
  useScrollFrame(frameRef, motion, onFrame);

  const style = event.heroImageUrl
    ? { ...heroPhotoStyle(event.heroImageUrl, event.heroOptions), backgroundSize: "cover", backgroundPosition: "center" }
    : usesBundledPhoto(event)
      ? { backgroundImage: `url("${bundledPhotoUrl}")`, backgroundSize: "cover", backgroundPosition: "center" }
      : { backgroundImage: heroArtworkUrl(artworkKeyFor(event)), backgroundSize: "cover", backgroundPosition: "right center" };

  return (
    <section
      ref={frameRef}
      aria-label={`${event.name}, a memory`}
      className="relative flex min-h-[220px] flex-col justify-end overflow-hidden rounded-2xl p-5 text-white shadow-lg sm:min-h-[260px] sm:p-7"
    >
      <div ref={pictureRef} className="absolute inset-0" style={style} aria-hidden="true" />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.1) 80%)" }}
        aria-hidden="true"
      />
      {motion ? <HeroEmbers /> : null}
      <div ref={copyRef} className="relative">
        <span className="inline-flex rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] backdrop-blur-sm">
          Memory
        </span>
        <h2
          className="font-display mt-2 text-3xl font-semibold leading-tight [text-shadow:0_2px_12px_rgba(0,0,0,0.6)] sm:text-4xl"
          aria-label={event.name}
        >
          {motion ? <RisingWords text={event.name} /> : event.name}
        </h2>
        <p className="mt-1.5 text-sm text-white/90">
          {[event.dates, event.location].filter(Boolean).join(" · ")}
        </p>
      </div>
    </section>
  );
}
