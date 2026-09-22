import { AnimatedNumber } from "@/components/shared/animated-number";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, CircleAlert, HandCoins, HeartHandshake, Landmark, ReceiptIndianRupee, Users } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { formatCurrencyCompact } from "@/features/dashboard/dashboard-utils";

export function FinancialSummary({
  totalBudget,
  actualExpenses,
  fundsReceived,
  fundingGap,
  sponsors,
  contributors,
}: {
  totalBudget: number;
  actualExpenses: number;
  fundsReceived: number;
  fundingGap: number;
  sponsors: number;
  contributors: number;
}) {
  const isSettledGap = fundingGap === 0;
  const cards = [
    {
      label: "Planned Budget",
      value: totalBudget,
      icon: Landmark,
      chip: "bg-primary/10 text-primary",
      edge: "before:bg-primary",
    },
    {
      label: "Funds Received",
      value: fundsReceived,
      icon: HandCoins,
      chip: "bg-emerald-100 text-emerald-700",
      edge: "before:bg-emerald-500",
    },
    {
      label: "Actual Expenses",
      value: actualExpenses,
      icon: ReceiptIndianRupee,
      chip: "bg-amber-100 text-amber-700",
      edge: "before:bg-amber-500",
    },
    {
      label: "Funding Gap",
      value: fundingGap,
      icon: isSettledGap ? Check : CircleAlert,
      chip: isSettledGap ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
      edge: isSettledGap ? "before:bg-emerald-500" : "before:bg-rose-500",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Landmark className="h-4 w-4" aria-hidden="true" />
          </span>
          <CardTitle>Financial Summary</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {cards.map((card, index) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className={`relative overflow-hidden rounded-lg border bg-gradient-to-br from-background to-muted/40 p-3 pl-4 transition-all hover:-translate-y-0.5 hover:shadow-md before:absolute before:inset-y-0 before:left-0 before:w-1 ${card.edge}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium leading-tight text-muted-foreground">{card.label}</p>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${card.chip}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </div>
                <AnimatedNumber
                  value={card.value}
                  format={formatCurrencyCompact}
                  duration={900 + index * 120}
                  className="mt-2 block text-xl font-semibold tracking-tight tabular-nums"
                  title={formatCurrency(card.value)}
                />
                {card.label === "Funding Gap" && isSettledGap ? (
                  <p className="mt-0.5 animate-fade-in text-xs font-medium text-emerald-700">Fully funded</p>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 divide-x rounded-lg border bg-muted/50 text-sm">
          <div className="flex items-center gap-2.5 p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-primary">
              <HeartHandshake className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Sponsors</p>
              <AnimatedNumber
                value={sponsors}
                format={(count) => String(count)}
                duration={800}
                className="block text-lg font-semibold leading-tight tabular-nums"
              />
            </div>
          </div>
          <div className="flex items-center gap-2.5 p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-primary">
              <Users className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Contributors</p>
              <AnimatedNumber
                value={contributors}
                format={(count) => String(count)}
                duration={800}
                className="block text-lg font-semibold leading-tight tabular-nums"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
