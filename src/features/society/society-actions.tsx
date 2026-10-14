import { FilePenLine, Plus, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * What this person may do here, as a quiet line of links - not a row of buttons.
 *
 * Which of them appear is exactly what the page already decided from the server's answer (`canManage`) and
 * the viewer's society role; this only draws them. Drafts shows only when there are some, with the count -
 * both come from the Society Home read, so it adds no request. Each target keeps a 40px-high tap area and a
 * visible focus ring even though there is no box.
 */

const action =
  "inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SocietyActions({
  canManage,
  isSocietyAdmin,
  societySlug,
  draftCount,
  draftsOpen,
  onToggleDrafts,
}: {
  canManage: boolean;
  isSocietyAdmin: boolean;
  societySlug: string | null | undefined;
  draftCount: number;
  draftsOpen: boolean;
  onToggleDrafts: () => void;
}) {
  if (!canManage) return null;

  return (
    <nav aria-label="Society actions" className="mt-2 flex flex-wrap items-center gap-x-5">
      <Link to="/new-event" className={action}>
        <Plus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Create event
      </Link>
      {isSocietyAdmin && societySlug ? (
        <Link to={`/society/${societySlug}/admin`} className={action}>
          <Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Manage society
        </Link>
      ) : null}
      {draftCount > 0 ? (
        <button type="button" className={cn(action)} aria-expanded={draftsOpen} onClick={onToggleDrafts}>
          <FilePenLine className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>
            Drafts · <span className="tabular-nums">{draftCount}</span>
            <span className="sr-only">, {draftsOpen ? "hide" : "show"} the list</span>
          </span>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
        </button>
      ) : null}
    </nav>
  );
}
