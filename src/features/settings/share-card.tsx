import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";
import { BlockRow, ListGroup, ListRow } from "@/features/settings/ios-list";

/**
 * The permanent link to this event.
 *
 * `/s/<token>` rather than the event's id: a token is short enough to read
 * out, and it can be replaced, which an id cannot. Replacing retires the old
 * link the moment it is done - that is the only way to take back something
 * that went further than intended.
 *
 * What somebody opening it can actually see is unchanged: it is still page by
 * page, from Modules. A link to an event with nothing public shows them a
 * sign-in, not an empty dashboard.
 */
export function ShareCard() {
  const { data } = useEventData({ includeTasks: false });
  const { selectedEventId } = useEventContext();
  const access = usePageAccess("dashboard");
  const queryClient = useQueryClient();

  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mint = useMutation({
    mutationFn: () =>
      apiFetch<{ shareToken: string }>("/api/events?resource=share", {
        method: "POST",
        body: { eventId: selectedEventId },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-data"] }),
  });

  if (!selectedEventId || !access.canEdit) return null;

  const token = data.event.shareToken ?? null;
  const link = token ? `${window.location.origin}/s/${token}` : null;

  async function makeLink(replacing: boolean) {
    if (replacing && !window.confirm("Replace the link? The one you handed out stops working straight away.")) {
      return;
    }
    setMessage(replacing ? "Making a new link..." : "Making the link...");
    try {
      await mint.mutateAsync();
      setMessage(replacing ? "New link ready. Hand this one out instead." : "Link ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not make a link");
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Refused in some browsers and on every insecure origin. The link is on
      // screen either way, and it is short enough to read out.
      setMessage("Could not copy. The link is above.");
    }
  }

  return (
    <div>
      <ListGroup
        header="Share this event"
        footer={
          <>
            {message ? <span className="mb-1 block">{message}</span> : null}
            One link that opens this event for anybody, with no account and no invite code. What they can see is still
            decided page by page in Pages above.
            {link ? " Replacing makes a new link and stops the old one working. Use it if a link went somewhere it should not have." : ""}
          </>
        }
      >
        {link ? (
          <>
            <BlockRow>
              <code className="block truncate font-mono text-sm text-muted-foreground">{link}</code>
            </BlockRow>
            <ListRow icon={Copy} tone="blue" title={copied ? "Copied" : "Copy link"} chevron={false} onClick={() => void copyLink()} />
            <ListRow
              icon={RefreshCw}
              tone="orange"
              title="Replace the link"
              chevron={false}
              disabled={mint.isPending}
              onClick={() => void makeLink(true)}
            />
          </>
        ) : (
          <ListRow
            icon={Link2}
            tone="green"
            title={mint.isPending ? "Making the link..." : "Make a share link"}
            chevron={false}
            disabled={mint.isPending}
            onClick={() => void makeLink(false)}
          />
        )}
      </ListGroup>
    </div>
  );
}
