import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Cards are boxed everywhere by default. A screen that wants its cards to read as plain sections (a heading, the
 * content, a hairline between neighbours) wraps them in <FlatCards>; nothing changes for any screen that does not.
 * Event Settings uses it so a section is one flat page and not boxes inside a panel.
 */
const FlatCardsContext = React.createContext(false);

export function FlatCards({ children }: { children: React.ReactNode }) {
  return <FlatCardsContext.Provider value={true}>{children}</FlatCardsContext.Provider>;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const flat = React.useContext(FlatCardsContext);
  return (
    <div
      className={cn(
        flat
          ? "border-t py-7 text-card-foreground first:border-t-0 first:pt-1"
          : "rounded-lg border bg-card text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const flat = React.useContext(FlatCardsContext);
  return <div className={cn("flex flex-col gap-1.5", flat ? "pb-4" : "p-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const flat = React.useContext(FlatCardsContext);
  return (
    <h3
      className={cn(flat ? "font-display text-xl leading-tight" : "text-base font-semibold leading-none", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const flat = React.useContext(FlatCardsContext);
  return <div className={cn(flat ? "" : "p-5 pt-0", className)} {...props} />;
}
