import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { overlayGlass } from "@/lib/glass";
import { cn } from "@/lib/utils";
import type { PlatformSession } from "./platform-api";
import { platformSections, sectionFromPath, sectionPath, type PlatformSection } from "./platform-sections";

/**
 * The Control Center's frame.
 *
 * Desktop: a compact sidebar that stays put, and the page beside it. Phone: a slim top bar that says where you are,
 * and the seven sections in a right-hand drawer behind a round button at the bottom right - the same pattern as
 * the rest of Sympal Events (UI rules §5), never a sideways-scrolling rail. The button is a sibling of the header,
 * not inside it: the header's backdrop blur would otherwise become its containing block (CLAUDE.md, Navigation).
 *
 * Section links carry the current search (`?range=`), so moving between sections keeps the reporting period.
 */
export function PlatformShell({ session }: { session: PlatformSession }) {
  const location = useLocation();
  const current = sectionFromPath(location.pathname);

  useEffect(() => {
    document.title = `${current.label} · SymPal Platform`;
  }, [current.label]);

  // Every section starts at the top, as every page of the app does.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border/80 px-3 pb-4 pt-5 lg:flex">
        <Brand />
        <nav aria-label="Platform sections" className="mt-7 flex-1">
          <SectionLinks search={location.search} />
        </nav>
        <Owner session={session} />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/80 bg-background/85 px-4 backdrop-blur lg:hidden">
          <Brand compact />
          <span className="truncate text-sm font-medium text-muted-foreground">{current.label}</span>
        </header>
        <MobileMenu session={session} current={current} search={location.search} />

        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link to={sectionPath("overview")} className="flex min-w-0 items-center gap-2.5 rounded-lg px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary font-display text-lg text-primary-foreground">
        S
      </span>
      <span className="min-w-0 leading-none">
        <span className="block font-display text-lg">SymPal</span>
        {compact ? null : <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Platform</span>}
      </span>
    </Link>
  );
}

function SectionLinks({ search, onNavigate }: { search: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {platformSections.map((section) => {
        const Icon = section.icon;
        return (
          <li key={section.key}>
            <NavLink
              to={{ pathname: sectionPath(section.key), search }}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-primary/[0.08] font-medium text-primary"
                    : "text-foreground/80 [@media(hover:hover)]:hover:bg-muted/70 [@media(hover:hover)]:hover:text-foreground",
                )
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              {section.label}
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}

function Owner({ session }: { session: PlatformSession }) {
  const name = session.user.name ?? session.user.email ?? "Platform owner";
  return (
    <div className="border-t border-border/80 px-2 pt-4">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
          {name.trim()[0]?.toUpperCase() ?? "P"}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block text-xs text-muted-foreground">Platform owner</span>
        </span>
      </div>
      <Link
        to="/society"
        className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Sympal Events
      </Link>
    </div>
  );
}

function MobileMenu({ session, current, search }: { session: PlatformSession; current: PlatformSection; search: string }) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={`Open menu. Current section: ${current.label}`}
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full border bg-card text-foreground shadow-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:hidden"
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={`fixed inset-0 z-50 ${overlayGlass}`} />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(20rem,86vw)] flex-col bg-background shadow-[-12px_0_32px_-16px_hsl(var(--foreground)/0.35)] outline-none duration-300 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right">
          <div className="flex h-14 shrink-0 items-center justify-between px-4">
            <DialogPrimitive.Title className="font-display text-xl">Platform</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">The seven sections of the Platform Control Center.</DialogPrimitive.Description>
          <nav aria-label="Platform sections" className="min-h-0 flex-1 overflow-y-auto px-3">
            <SectionLinks search={search} onNavigate={() => setOpen(false)} />
          </nav>
          <div className="shrink-0 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <Owner session={session} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
