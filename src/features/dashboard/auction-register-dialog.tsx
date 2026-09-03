import { Gavel } from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/shared/form-field";
import type { useAuctionRegistration } from "@/lib/auction-registration";

/**
 * Collects name / flat / phone and registers the signed-in user for an
 * auction. Bidding itself is not built yet - this is the entry point for it:
 * a registrant here is who the future "place a bid" flow will authorize.
 */
export function AuctionRegisterDialog({
  open,
  onOpenChange,
  auctionTitle,
  defaultName,
  register,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auctionTitle: string;
  defaultName: string;
  register: ReturnType<typeof useAuctionRegistration>["register"];
}) {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const flat = String(formData.get("flat") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();

    try {
      await register.mutateAsync({ name, flat, phone });
      onOpenChange(false);
    } catch (item) {
      setError(item instanceof Error ? item.message : "Unable to register");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register for {auctionTitle}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Bidding hasn&apos;t opened yet. Register now and you&apos;ll be ready when it does.
          </p>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <FormField label="Your Name" name="name" defaultValue={defaultName} required />
          <FormField label="Flat No" name="flat" required />
          <FormField label="Phone Number" name="phone" type="tel" required />
          {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={register.isPending}>
              <Gavel className="h-4 w-4" aria-hidden="true" />
              {register.isPending ? "Registering..." : "Register"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
