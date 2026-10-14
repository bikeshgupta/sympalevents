import * as React from "react";
import { useIosPage } from "@/components/ui/ios-page-context";
import { cn } from "@/lib/utils";

/**
 * Cards are boxed everywhere by default. A screen that wants its cards to read as plain sections (a heading, the
 * content, a hairline between neighbours) wraps them in <FlatCards>; nothing changes for any screen that does not.
 * Event Settings uses it so a section is one flat page and not boxes inside a panel.
 */
const FlatCardsContext = React.createContext(false);
const GroupedCardsContext = React.createContext(false);

export function FlatCards({ children }: { children: React.ReactNode }) {
  return <FlatCardsContext.Provider value={true}>{children}</FlatCardsContext.Provider>;
}

/**
 * The iOS "inset grouped" look: each card becomes a caption (its title, small and grey, above) over one rounded white
 * group, with the spacing of a Settings screen. Event Settings uses it; nothing else does.
 */
export function GroupedCards({ children }: { children: React.ReactNode }) {
  return <GroupedCardsContext.Provider value={true}>{children}</GroupedCardsContext.Provider>;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const flat = React.useContext(FlatCardsContext);
  const grouped = React.useContext(GroupedCardsContext);
  const ios = useIosPage();
  return (
    <div
      className={cn(
        grouped
          ? "mt-7 text-card-foreground first:mt-0"
          : flat
          ? "border-t py-7 text-card-foreground first:border-t-0 first:pt-1"
          : ios
            ? "rounded-3xl bg-card text-card-foreground shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] ring-1 ring-black/[0.04]"
            : "rounded-lg border bg-card text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const flat = React.useContext(FlatCardsContext);
  const grouped = React.useContext(GroupedCardsContext);
  return <div className={cn("flex flex-col gap-1.5", grouped ? "px-4 pb-2" : flat ? "pb-4" : "p-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const flat = React.useContext(FlatCardsContext);
  const grouped = React.useContext(GroupedCardsContext);
  return (
    <h3
      className={cn(grouped ? "text-[13px] font-normal uppercase leading-tight tracking-wide text-muted-foreground" : flat ? "font-display text-xl leading-tight" : "text-base font-semibold leading-none", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const flat = React.useContext(FlatCardsContext);
  const grouped = React.useContext(GroupedCardsContext);
  return (
    <div
      className={cn(
        grouped ? "overflow-hidden rounded-3xl bg-white p-4 shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] ring-1 ring-black/[0.04]" : flat ? "" : "p-5 pt-0",
        className,
      )}
      {...props}
    />
  );
}
