import { CheckCircle2, ClipboardList, HandCoins, HeartHandshake, Image, ReceiptIndianRupee } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEventData } from "@/lib/event-data";
import { formatCurrency } from "@/lib/utils";

export function DashboardPage() {
  const { data, isLoading } = useEventData();
  const financials = data!.financials;
  const tasks = data!.tasks;
  const sponsors = data!.sponsors;
  const contributions = data!.contributions;
  const remainingBudget = financials.totalBudget - financials.actualExpenses;
  const financeData = [
    { name: "Budget", value: financials.totalBudget },
    { name: "Expenses", value: financials.actualExpenses },
    { name: "Remaining", value: remainingBudget },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">{data?.event.location}</p>
            <h2 className="mt-1 text-2xl font-semibold">{data?.event.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{data?.event.dates} - Live planning dashboard</p>
          </div>
          <DataSourceBadge source={isLoading ? undefined : data?.source} reason={data?.fallbackReason} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Budget" value={formatCurrency(financials.totalBudget)} icon={ReceiptIndianRupee} />
        <StatCard title="Actual Expenses" value={formatCurrency(financials.actualExpenses)} icon={HandCoins} />
        <StatCard title="Remaining Budget" value={formatCurrency(remainingBudget)} icon={CheckCircle2} />
        <StatCard title="Pending Tasks" value={String(tasks.filter((task) => task.status !== "Completed").length)} icon={ClipboardList} note={`${tasks.filter((task) => task.status === "Blocked").length} blocked`} />
        <StatCard title="Contribution Received" value={formatCurrency(financials.contributionReceived)} icon={HandCoins} />
        <StatCard title="Sponsorship Received" value={formatCurrency(financials.sponsorshipReceived)} icon={ReceiptIndianRupee} />
        <StatCard title="Sponsors" value={String(sponsors.length)} icon={HeartHandshake} />
        <StatCard title="Contributions" value={String(contributions.length)} icon={HandCoins} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader>
            <CardTitle>Financial Overview</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financeData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(value) => `₹${Number(value) / 1000}k`} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#0f766e" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gallery</CardTitle>
          </CardHeader>
          <CardContent className="flex h-72 items-center justify-center">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Image className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium">Event Images</p>
              <p className="mt-1 text-sm text-muted-foreground">Gallery will appear here once images are added.</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
