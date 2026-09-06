import { CalendarCheck2, HandCoins, HeartHandshake, Pencil, Sparkles, Star, Users } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { closingText, type ClosingFacts } from "@/features/closing/closing-copy";
import { StarRating } from "@/features/closing/star-rating";
import { formatCurrencyCompact } from "@/features/dashboard/dashboard-utils";
import { formatRating, type ClosingPayload } from "@/lib/closing";
import { formatCurrency } from "@/lib/utils";

/**
 * The thank-you note. Every event gets one whether or not anybody writes it,
 * because the numbers behind it are already true - see closing-copy.ts.
 */
export function ClosingStory({
  closing,
  facts,
  canManage,
  onSave,
}: {
  closing?: ClosingPayload["closing"];
  facts: ClosingFacts;
  canManage: boolean;
  onSave: (input: { headline: string; message: string }) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const text = closingText(closing, facts);

  return (
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-amber-100/40"
        aria-hidden="true"
      />
      <CardContent className="relative space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5 animate-pulse-soft" aria-hidden="true" />
            Celebration complete
          </span>
          {canManage ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit note
            </Button>
          ) : null}
        </div>

        <h2 className="font-display text-2xl leading-tight sm:text-4xl">{text.headline}</h2>

        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {text.message.split(/\n{2,}/).map((paragraph, index) => (
            <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>
          ))}
        </div>

        {canManage && text.isDefault ? (
          <p className="rounded-md bg-background/70 p-3 text-xs text-muted-foreground">
            This note is written from the event's own numbers. Edit it to say it in your own words - residents see
            whichever version is here.
          </p>
        ) : null}
      </CardContent>

      {canManage && editing ? (
        <ClosingNoteDialog
          initial={{ headline: closing?.headline ?? "", message: closing?.message ?? "" }}
          suggestion={text}
          onOpenChange={setEditing}
          onSave={onSave}
        />
      ) : null}
    </Card>
  );
}

function ClosingNoteDialog({
  initial,
  suggestion,
  onOpenChange,
  onSave,
}: {
  initial: { headline: string; message: string };
  suggestion: { headline: string; message: string };
  onOpenChange: (open: boolean) => void;
  onSave: (input: { headline: string; message: string }) => Promise<unknown>;
}) {
  const [headline, setHeadline] = useState(initial.headline || suggestion.headline);
  const [message, setMessage] = useState(initial.message || suggestion.message);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({ headline, message });
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Closing note</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="closing-headline">Headline</Label>
            <Input
              id="closing-headline"
              value={headline}
              maxLength={200}
              onChange={(event) => setHeadline(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="closing-message">Message</Label>
            <textarea
              id="closing-message"
              value={message}
              maxLength={4000}
              rows={12}
              onChange={(event) => setMessage(event.target.value)}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Blank lines start a new paragraph. Clear the whole box to go back to the generated note.
            </p>
          </div>
          {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save note"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The celebration in numbers. Loading shows a dash, never a zero. */
export function ClosingStats({ facts, isLoading }: { facts: ClosingFacts; isLoading: boolean }) {
  const total = facts.contributionReceived + facts.sponsorshipReceived;
  const tiles = [
    { label: "Days celebrated", value: facts.dayCount, icon: CalendarCheck2, format: (value: number) => String(value) },
    { label: "Contributors", value: facts.contributorCount, icon: Users, format: (value: number) => String(value) },
    { label: "Sponsors", value: facts.sponsorCount, icon: HeartHandshake, format: (value: number) => String(value) },
    {
      label: "Raised together",
      value: total,
      icon: HandCoins,
      format: formatCurrencyCompact,
      title: formatCurrency(total),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile, index) => {
        const Icon = tile.icon;
        return (
          <div key={tile.label} className="rounded-lg border bg-gradient-to-br from-background to-muted/40 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium leading-tight text-muted-foreground">{tile.label}</p>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
            {isLoading ? (
              <p className="mt-2 text-xl font-semibold text-muted-foreground">…</p>
            ) : (
              <AnimatedNumber
                value={tile.value}
                format={tile.format}
                duration={800 + index * 100}
                className="mt-2 block text-xl font-semibold tracking-tight tabular-nums"
                title={tile.title}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The dashboard's version, shown once the committee marks the event closed:
 * the note in short, the headline numbers and the rating, with the rest of
 * the story a tap away. It sits above the money cards - after the event,
 * "how did it go" matters more than "what is still unfunded".
 */
export function ClosingDashboardCard({
  closing,
  facts,
  feedback,
  isLoading,
}: {
  closing?: ClosingPayload["closing"];
  facts: ClosingFacts;
  feedback?: ClosingPayload["feedback"];
  isLoading: boolean;
}) {
  const text = closingText(closing, facts);
  const firstParagraph = text.message.split(/\n{2,}/)[0];

  return (
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-amber-100/40"
        aria-hidden="true"
      />
      <CardContent className="relative space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5 animate-pulse-soft" aria-hidden="true" />
            Celebration complete
          </span>
          {feedback?.count ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-background px-3 py-1 text-sm">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
              <span className="font-semibold tabular-nums">{formatRating(feedback.average)}</span>
              <span className="text-xs text-muted-foreground">
                {feedback.count} {feedback.count === 1 ? "review" : "reviews"}
              </span>
            </span>
          ) : null}
        </div>

        <div>
          <h2 className="font-display text-xl leading-tight sm:text-2xl">{text.headline}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{firstParagraph}</p>
        </div>

        <ClosingStats facts={facts} isLoading={isLoading} />

        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="sm">
            <Link to="/closing">Read the full story</Link>
          </Button>
          <Link to="/closing" className="text-sm font-medium text-primary underline underline-offset-2">
            Photos and reviews
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/** The rating strip shown at the top of the closing page. */
export function ClosingRatingStrip({ feedback }: { feedback?: ClosingPayload["feedback"] }) {
  if (!feedback?.count) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
      <StarRating
        value={feedback.average}
        label={`Rated ${feedback.average.toFixed(1)} out of 5 from ${feedback.count} reviews`}
      />
      <span className="text-lg font-semibold tabular-nums">{formatRating(feedback.average)}</span>
      <span className="text-sm text-muted-foreground">
        from {feedback.count} {feedback.count === 1 ? "review" : "reviews"}
      </span>
    </div>
  );
}
