import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { FormEvent, ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function CrudDialog({
  title,
  triggerLabel,
  children,
  onSubmit,
}: {
  title: string;
  triggerLabel: string;
  children: ReactNode;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(new FormData(event.currentTarget));
      await queryClient.invalidateQueries({ queryKey: ["event-data"] });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save record");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">{children}</div>
          {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function formString(formData: FormData, key: string, fallback = "") {
  return String(formData.get(key) ?? fallback).trim();
}

export function formNumber(formData: FormData, key: string) {
  const value = Number(formData.get(key) ?? 0);
  if (Number.isNaN(value) || value < 0) throw new Error(`${key} must be a positive amount`);
  return value;
}
