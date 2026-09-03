import { ArrowLeft, Check, Copy, HeartHandshake, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ContributionPayment,
  suggestedAmounts,
  useReportContributionPayment,
  useStartContributionPayment,
} from "@/lib/contribution-payments";
import { buildUpiUrl, isLikelyMobile, isUpiConfigured, upiApps, upiPayeeName, upiVpa } from "@/lib/upi";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * The resident-facing half of self-service contributions.
 *
 * Three steps, because the middle one is a hand-off we do not control: the
 * resident's UPI app takes over and the browser never learns how it went. So
 * step 2 asks them, and even a "yes I paid" only produces a claim the
 * committee still has to confirm - the copy says so rather than implying the
 * contribution is already recorded.
 */
type Step = "details" | "pay" | "reported" | "cancelled";

const residentTypes = ["Owner", "Tenant"];

/**
 * Quick-pick amounts, derived from what this event already expects per flat
 * rather than hardcoded: a society collecting ₹1,000 and one collecting ₹2,500
 * both get sensible chips, and a brand new event with no rows yet simply gets
 * the plain amount field.
 */
export function ContributeButton({
  eventId,
  eventName,
  expectedPerFlat = 0,
  label = "Contribute now",
  className,
  variant = "default",
  size = "default",
}: {
  eventId?: string;
  eventName: string;
  expectedPerFlat?: number;
  label?: string;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);

  // Nothing to hand off to until someone sets VITE_UPI_ID, and no event to
  // attribute the payment to before one is selected - in both cases the honest
  // thing is to not offer the button at all.
  if (!isUpiConfigured || !eventId) return null;

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <HeartHandshake className="h-4 w-4" aria-hidden="true" />
        {label}
      </Button>
      <ContributeDialog
        open={open}
        onOpenChange={setOpen}
        eventId={eventId}
        eventName={eventName}
        expectedPerFlat={expectedPerFlat}
      />
    </>
  );
}

function ContributeDialog({
  open,
  onOpenChange,
  eventId,
  eventName,
  expectedPerFlat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventName: string;
  expectedPerFlat: number;
}) {
  const [step, setStep] = useState<Step>("details");
  const [payment, setPayment] = useState<ContributionPayment | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const start = useStartContributionPayment();
  const report = useReportContributionPayment();

  const chips = useMemo(() => suggestedAmounts(expectedPerFlat), [expectedPerFlat]);

  function reset() {
    setStep("details");
    setPayment(null);
    setAmount("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    // Reset on close rather than on open so the closing animation does not
    // show the form flicking back to step one.
    if (!next) window.setTimeout(reset, 200);
  }

  async function handleDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const parsedAmount = Number(formData.get("amount"));

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter the amount you want to contribute.");
      return;
    }

    try {
      const result = await start.mutateAsync({
        eventId,
        flat: String(formData.get("flat") ?? "").trim(),
        name: String(formData.get("name") ?? "").trim(),
        type: String(formData.get("type") ?? "Owner"),
        phone: String(formData.get("phone") ?? "").trim(),
        amount: parsedAmount,
        note: String(formData.get("note") ?? "").trim(),
        upiVpa,
      });
      setPayment(result.payment);
      setStep("pay");
    } catch (item) {
      setError(item instanceof Error ? item.message : "Could not start the payment. Please try again.");
    }
  }

  async function handleReport(action: "reported" | "cancelled", payerReference?: string) {
    if (!payment) return;
    setError(null);

    try {
      await report.mutateAsync({ paymentId: payment.id, reference: payment.reference, action, payerReference });
      setStep(action === "reported" ? "reported" : "cancelled");
    } catch (item) {
      setError(item instanceof Error ? item.message : "Could not save your response. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "details" ? "Contribute to " : ""}
            {step === "details" ? eventName : step === "pay" ? "Complete your payment" : "Thank you"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {step === "details"
              ? "Pay directly from your own UPI app. Your details help the committee match the payment."
              : step === "pay"
                ? "Open your UPI app, pay, then come back and tell us how it went."
                : null}
          </p>
        </DialogHeader>

        {step === "details" ? (
          <DetailsStep
            chips={chips}
            amount={amount}
            onAmountChange={setAmount}
            onSubmit={handleDetailsSubmit}
            saving={start.isPending}
            error={error}
            onCancel={() => handleOpenChange(false)}
          />
        ) : null}

        {step === "pay" && payment ? (
          <PayStep
            payment={payment}
            eventName={eventName}
            onBack={() => setStep("details")}
            onReport={handleReport}
            saving={report.isPending}
            error={error}
          />
        ) : null}

        {step === "reported" && payment ? (
          <ReportedStep payment={payment} onClose={() => handleOpenChange(false)} />
        ) : null}

        {step === "cancelled" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              No problem — nothing has been recorded against your flat. You can start again whenever you are ready.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
              <Button onClick={reset}>Try again</Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DetailsStep({
  chips,
  amount,
  onAmountChange,
  onSubmit,
  saving,
  error,
  onCancel,
}: {
  chips: number[];
  amount: string;
  onAmountChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
}) {
  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="amount">Amount</Label>
        {chips.length ? (
          <div className="flex flex-wrap gap-2">
            {chips.map((value) => {
              const isActive = amount === String(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onAmountChange(String(value))}
                  aria-pressed={isActive}
                  className={cn(
                    "h-10 rounded-full border px-4 text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-muted",
                  )}
                >
                  {formatCurrency(value)}
                </button>
              );
            })}
          </div>
        ) : null}
        <Input
          id="amount"
          name="amount"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          required
          placeholder="Enter an amount"
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
          className="tabular-nums"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="flat">Flat No</Label>
          <Input id="flat" name="flat" required placeholder="A-101" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Your Name</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Owner/Tenant</Label>
          <select
            id="type"
            name="type"
            defaultValue="Owner"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {residentTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" type="tel" inputMode="tel" placeholder="For payment queries" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Message (optional)</Label>
        <Input id="note" name="note" maxLength={200} placeholder="Anything the committee should know" />
      </div>

      {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {saving ? "Preparing…" : "Continue to pay"}
        </Button>
      </div>
    </form>
  );
}

function PayStep({
  payment,
  eventName,
  onBack,
  onReport,
  saving,
  error,
}: {
  payment: ContributionPayment;
  eventName: string;
  onBack: () => void;
  onReport: (action: "reported" | "cancelled", payerReference?: string) => void;
  saving: boolean;
  error: string | null;
}) {
  const [payerReference, setPayerReference] = useState("");
  // Read once on mount: whether to lead with app buttons or with the VPA to
  // copy does not need to react to a resize.
  const [mobile] = useState(isLikelyMobile);

  const note = `${eventName} ${payment.flat_no}`.slice(0, 50);
  const links = upiApps.map((app) => ({
    app,
    href: buildUpiUrl(app, { amount: payment.amount, reference: payment.reference, note }),
  }));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/40 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted-foreground">Paying</span>
          <span className="text-2xl font-semibold tabular-nums">{formatCurrency(payment.amount)}</span>
        </div>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">To</dt>
            <dd className="text-right font-medium">{upiPayeeName}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">UPI ID</dt>
            <dd className="text-right">
              <CopyValue value={upiVpa} label="UPI ID" />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Reference</dt>
            <dd className="text-right">
              <CopyValue value={payment.reference} label="Reference" />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Flat</dt>
            <dd className="text-right font-medium">
              {payment.flat_no} · {payment.resident_name}
            </dd>
          </div>
        </dl>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">
          {mobile ? "Open your UPI app" : "Pay from your phone"}
        </p>
        {mobile ? (
          <div className="grid grid-cols-2 gap-2">
            {links.map(({ app, href }) => (
              <a
                key={app.key}
                href={href}
                className={cn(
                  "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  app.key === "any"
                    ? "col-span-2 bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-input bg-background hover:bg-muted",
                )}
              >
                <Smartphone className="h-4 w-4" aria-hidden="true" />
                {app.key === "any" ? `Pay ${formatCurrency(payment.amount)}` : app.label}
              </a>
            ))}
          </div>
        ) : (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            UPI apps only open on a phone. Copy the UPI ID above into PhonePe, Google Pay or any UPI app, pay{" "}
            <span className="font-medium text-foreground tabular-nums">{formatCurrency(payment.amount)}</span>, and put{" "}
            <span className="font-medium text-foreground">{payment.reference}</span> in the remarks.
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm font-medium">Once you have paid</p>
        <div className="space-y-2">
          <Label htmlFor="payerReference">UPI transaction ID (optional)</Label>
          <Input
            id="payerReference"
            value={payerReference}
            onChange={(event) => setPayerReference(event.target.value)}
            placeholder="From your UPI app's receipt"
            maxLength={60}
          />
          <p className="text-xs text-muted-foreground">
            Adding it helps the committee match your payment faster.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="sm:flex-1" disabled={saving} onClick={() => onReport("reported", payerReference.trim())}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            I have paid
          </Button>
          <Button variant="outline" className="sm:flex-1" disabled={saving} onClick={() => onReport("cancelled")}>
            I could not complete it
          </Button>
        </div>
      </div>

      {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      <Button variant="ghost" size="sm" onClick={onBack} disabled={saving}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Change details
      </Button>
    </div>
  );
}

function ReportedStep({ payment, onClose }: { payment: ContributionPayment; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium">Recorded as pending confirmation</p>
          <p className="text-sm text-muted-foreground">
            A committee member will match{" "}
            <span className="font-medium text-foreground tabular-nums">{formatCurrency(payment.amount)}</span> against
            the account and confirm it. It appears in the Contributions list once confirmed — not before.
          </p>
        </div>
      </div>
      <dl className="space-y-1.5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Your reference</dt>
          <dd className="text-right">
            <CopyValue value={payment.reference} label="Reference" />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Flat</dt>
          <dd className="text-right font-medium">
            {payment.flat_no} · {payment.resident_name}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Keep this reference — quote it if you need to follow up with the committee.
      </p>
      <div className="flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

/** A value the payer will need to paste elsewhere, with one-tap copy. */
function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused (insecure context, permissions). The
      // value is on screen either way, so this is not worth an error state.
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="break-all">{value}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </button>
  );
}
