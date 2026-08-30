import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button type="button" variant="ghost" size="icon" onClick={onEdit} aria-label="Edit">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label="Delete">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}
