import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Cake,
  CircleHelp,
  Flag,
  Flame,
  Flower,
  Flower2,
  Gem,
  HandHeart,
  MailX,
  Moon,
  Mountain,
  Palette,
  PartyPopper,
  Sparkles,
  Star,
  Sunrise,
  Swords,
  TreePine,
  Users,
  Wind,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Flat icons for occasions: one line icon on a soft tinted tile, in the theme's own colour. Used wherever an
 * emoji used to stand for a kind of event, a festival or a reply - emoji draw differently on every phone and
 * clash with the app's line icons. The data stays pure (a key, or a festival's icon name); this maps it.
 */
const occasionIcons: Record<string, LucideIcon> = {
  // personal event kinds (shared/personal-events.ts)
  birthday: Cake,
  anniversary: Gem,
  get_together: Users,
  festival: Flame,
  wedding: Flower2,
  baby_shower: Baby,
  naming: Star,
  other: Sparkles,
  // festivals (src/features/society/festivals.ts)
  swords: Swords,
  moon: Moon,
  flame: Flame,
  sunrise: Sunrise,
  "hand-heart": HandHeart,
  tree: TreePine,
  party: PartyPopper,
  wind: Wind,
  flag: Flag,
  flower: Flower,
  mountain: Mountain,
  palette: Palette,
  // RSVP replies
  going: PartyPopper,
  maybe: CircleHelp,
  declined: MailX,
};

export function OccasionIcon({ name, className }: { name: string; className?: string }) {
  const Icon = occasionIcons[name] ?? Sparkles;
  return <Icon className={className} aria-hidden="true" strokeWidth={1.75} />;
}

/** The tile: a tinted rounded square ("canvas") holding the icon. `tone="inverse"` sits on a coloured cover. */
export function IconTile({
  name,
  size = "md",
  tone = "default",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  tone?: "default" | "inverse";
  className?: string;
}) {
  const box = { sm: "h-9 w-9 rounded-lg", md: "h-14 w-12 rounded-xl", lg: "h-16 w-16 rounded-2xl sm:h-20 sm:w-20" }[size];
  const icon = { sm: "h-[18px] w-[18px]", md: "h-6 w-6", lg: "h-8 w-8 sm:h-10 sm:w-10" }[size];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center",
        box,
        tone === "inverse" ? "bg-white/15 text-primary-foreground ring-1 ring-white/25 backdrop-blur-sm" : "bg-primary/10 text-primary",
        className,
      )}
    >
      <OccasionIcon name={name} className={icon} />
    </span>
  );
}
