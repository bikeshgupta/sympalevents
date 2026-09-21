import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Building2, Check, ChevronsUpDown, KeyRound, Plus } from "lucide-react";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/lib/auth";
import { useEventContext, type EventOption } from "@/lib/event-context";
import { useSocietyActions } from "@/lib/societies";
import { cn } from "@/lib/utils";

/**
 * The header's event picker, grouped by society.
 *
 * It replaces a bare `<select>` that only appeared when somebody happened to
 * have more than one event, and that listed them flat. Now that an event
 * belongs to a society and a person can belong to several, the grouping is the
 * information: two events called "Annual Day" mean nothing until you can see
 * which society each one belongs to.
 *
 * It sits exactly where the old control sat and carries the same two lines, so
 * the header is unchanged in shape.
 */

function eventWhen(event: EventOption) {
  const start = new Date(`${event.start_date}T00:00:00`);
  const end = new Date(`${event.end_date}T00:00:00`);
  const now = new Date();
  if (now < start) return "Upcoming";
  if (now > end) return "Completed";
  return "Live now";
}

const toneForWhen: Record<string, string> = {
  "Live now": "bg-accent text-accent-foreground",
  Upcoming: "bg-secondary text-secondary-foreground",
  Completed: "bg-muted text-muted-foreground",
};

function JoinSocietyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { join } = useSocietyActions();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setJoined(null);
    try {
      const result = await join.mutateAsync(code);
      setJoined(result.society.name);
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join that society");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Join a society</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Ask your committee for the society&rsquo;s invite code. Joining puts their events in your switcher. What you
          can open in each one is still up to that event&rsquo;s admin.
        </p>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="invite-code">Invite code</Label>
            <Input
              id="invite-code"
              name="inviteCode"
              value={code}
              onChange={(field) => setCode(field.target.value.toUpperCase())}
              placeholder="ABCD2345"
              autoComplete="off"
              className="font-mono tracking-widest"
              required
            />
          </div>
          {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          {joined ? (
            <p className="rounded-md bg-accent/60 p-3 text-sm text-accent-foreground">
              You joined {joined}. Their events are in your switcher now.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="submit" disabled={join.isPending || !code.trim()}>
              {join.isPending ? "Joining..." : "Join"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EventSwitcher({ eventName, eventSubtitle }: { eventName: string; eventSubtitle: string }) {
  const { events, societies, selectedEventId, setSelectedEventId } = useEventContext();
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [joinOpen, setJoinOpen] = useState(false);

  // Events whose society this person is not a member of still belong
  // somewhere, so an "Other events" group catches anything the society list
  // does not name - an event shared by link, or one whose society row predates
  // migration 023.
  const groups = societies
    .map((society) => ({
      id: society.id,
      name: society.name,
      events: events.filter((event) => event.societyId === society.id),
    }))
    .filter((group) => group.events.length > 0);

  const groupedIds = new Set(groups.flatMap((group) => group.events.map((event) => event.id)));
  const ungrouped = events.filter((event) => !groupedIds.has(event.id));

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="flex min-w-0 max-w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Switch event"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold lg:text-base">{eventName}</span>
              <span className="block truncate text-xs text-muted-foreground">{eventSubtitle}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={8}
            className="z-50 max-h-[70vh] w-80 overflow-y-auto rounded-lg border bg-popover p-1.5 shadow-lg"
          >
            {groups.length === 0 && ungrouped.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                {session
                  ? "You are not on any event yet. Create one, or join your society with its invite code."
                  : "Sign in to see the events you are part of."}
              </p>
            ) : null}

            {groups.map((group) => (
              <DropdownMenu.Group key={group.id}>
                <DropdownMenu.Label className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Building2 className="h-3 w-3" aria-hidden />
                  {group.name}
                </DropdownMenu.Label>
                {group.events.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    selected={event.id === selectedEventId}
                    onSelect={() => setSelectedEventId(event.id)}
                  />
                ))}
              </DropdownMenu.Group>
            ))}

            {ungrouped.length ? (
              <DropdownMenu.Group>
                {groups.length ? (
                  <DropdownMenu.Label className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Other events
                  </DropdownMenu.Label>
                ) : null}
                {ungrouped.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    selected={event.id === selectedEventId}
                    onSelect={() => setSelectedEventId(event.id)}
                  />
                ))}
              </DropdownMenu.Group>
            ) : null}

            {session ? (
              <>
                <DropdownMenu.Separator className="my-1.5 h-px bg-border" />
                <DropdownMenu.Item
                  onSelect={() => navigate("/settings")}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2.5 text-sm text-primary outline-none data-[highlighted]:bg-muted"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  New event
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => setJoinOpen(true)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2.5 text-sm text-primary outline-none data-[highlighted]:bg-muted"
                >
                  <KeyRound className="h-4 w-4" aria-hidden />
                  Join a society with an invite code
                </DropdownMenu.Item>
              </>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <JoinSocietyDialog open={joinOpen} onOpenChange={setJoinOpen} />
    </>
  );
}

function EventRow({
  event,
  selected,
  onSelect,
}: {
  event: EventOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const when = eventWhen(event);
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2.5 text-sm outline-none data-[highlighted]:bg-muted",
        selected && "bg-accent/50",
      )}
    >
      <Check className={cn("h-4 w-4 shrink-0 text-primary", !selected && "opacity-0")} aria-hidden />
      <span className="min-w-0 flex-1 truncate font-medium">{event.name}</span>
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", toneForWhen[when])}>{when}</span>
    </DropdownMenu.Item>
  );
}
