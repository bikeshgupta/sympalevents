import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RowActions({
  onEdit,
  onDelete,
  editLabel = "Edit",
  deleteLabel = "Delete",
}: {
  onEdit: () => void;
  onDelete: () => void;
  editLabel?: string;
  deleteLabel?: string;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button type="button" variant="ghost" size="icon" onClick={onEdit} aria-label={editLabel} title={editLabel}>
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onDelete}
        aria-label={deleteLabel}
        title={deleteLabel}
        className="hover:bg-destructive/10"
      >
        <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
      </Button>
    </div>
  );
}
