import { eventTypeStyle } from "@/features/society/event-type-style";
import { cn } from "@/lib/utils";

/**
 * What an event looks like before anybody has uploaded a photograph.
 *
 * The first version of this printed the event's initial in a grey square. It
 * read as missing content rather than as a design - a "T" tells you nothing a
 * card does not already say in larger type directly beside it.
 *
 * So each kind of event gets its own small piece of artwork: a gradient and an
 * icon. It is deliberately quiet - a wash and a line icon, not a block of
 * saturated colour - because a list of these has to read as one page, and
 * because the committee's own theme is the colour that should carry weight
 * here. Tailwind's palette utilities, the same way the amber migration banners
 * and emerald status pills already work; nothing is fetched from anywhere.
 */

/**
 * An event's picture: its own cover photograph when it has one, its type's
 * artwork when it does not. Same component either way, so a card never has to
 * branch on whether an image exists.
 */
export function EventArtwork({
  eventType,
  imageUrl,
  className,
  iconClassName,
  dim = false,
}: {
  eventType: string;
  imageUrl?: string | null;
  className?: string;
  iconClassName?: string;
  /** Completed events read as memories rather than as what is next. */
  dim?: boolean;
}) {
  const style = eventTypeStyle(eventType);
  const Icon = style.icon;

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        aria-hidden
        loading="lazy"
        className={cn("object-cover", dim && "saturate-[0.9]", className)}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        "flex items-center justify-center bg-gradient-to-br",
        style.gradient,
        dim && "saturate-[0.75]",
        className,
      )}
    >
      <Icon className={cn("h-6 w-6", style.iconTint, iconClassName)} strokeWidth={1.75} />
    </div>
  );
}
