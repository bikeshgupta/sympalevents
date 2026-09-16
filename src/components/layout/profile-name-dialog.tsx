import { useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";

/**
 * "This is my name, not the one Google has."
 *
 * Every list in this app - the credits on the closing page, the task board,
 * who arranged the prasad - shows whatever a person's Google account happens
 * to say, which for plenty of people is an initial, a nickname, or their name
 * in the wrong order. This is the one place to fix that, and it fixes it
 * everywhere at once because it is the same `app_users.full_name` row all of
 * them read.
 *
 * It only sticks because `requireAppUser` stopped rewriting that column from
 * the Google profile on every request - see the note in api/_lib/server.ts.
 * The photo and the email still follow the Google account.
 */
export function ProfileNameDialog({
  currentName,
  email,
  onOpenChange,
}: {
  currentName: string;
  email: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.replace(/\s+/g, " ").trim();
    if (!trimmed) {
      setError("Your name cannot be blank.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/me", { method: "PATCH", body: { fullName: trimmed } });
      // The session carries the name the header and every avatar read from.
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      await queryClient.invalidateQueries({ queryKey: ["event-members"] });
      await queryClient.invalidateQueries({ queryKey: ["event-closing"] });
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save your name");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Your name</DialogTitle>
          <p className="text-sm text-muted-foreground">
            How you appear to everybody else - on the credits, the task board and the prasad roster.
          </p>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={name}
              maxLength={80}
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
            {email ? <p className="text-xs text-muted-foreground">Signed in as {email}</p> : null}
          </div>
          {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save name"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
