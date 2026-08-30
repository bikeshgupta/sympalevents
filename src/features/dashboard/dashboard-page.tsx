import { AlertTriangle, CheckCircle2, ClipboardList, HandCoins, PackageCheck, ReceiptIndianRupee } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEventData } from "@/lib/event-data";
import { formatCurrency } from "@/lib/utils";

const colors = ["#0f766e", "#2563eb", "#e11d48", "#059669"];

export function DashboardPage() {
  const { data, isLoading } = useEventData();
  const financials = data!.financials;
  const tasks = data!.tasks;
  const remainingBudget = financials.totalBudget - financials.actualExpenses;
  const financeData = [
    { name: "Budget", value: financials.totalBudget },
    { name: "Expenses", value: financials.actualExpenses },
    { name: "Remaining", value: remainingBudget },
  ];
  const taskData = [
    { name: "Not Started", value: tasks.filter((task) => task.status === "Not Started").length },
    { name: "In Progress", value: tasks.filter((task) => task.status === "In Progress").length },
    { name: "Blocked", value: tasks.filter((task) => task.status === "Blocked").length },
    { name: "Completed", value: tasks.filter((task) => task.status === "Completed").length },
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
        <StatCard title="Pending Procurement" value="5" icon={PackageCheck} />
        <StatCard title="Critical Alerts" value="2" icon={AlertTriangle} />
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
            <CardTitle>Task Progress</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={taskData} dataKey="value" nameKey="name" outerRadius={88} label>
                  {taskData.map((_, index) => (
                    <Cell key={colors[index]} fill={colors[index]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {["Unpaid sound sponsorship", "Volunteer briefing is blocked", "Prasad menu confirmation due soon"].map((alert) => (
            <button key={alert} className="rounded-md border bg-background p-4 text-left text-sm hover:bg-muted">
              <AlertTriangle className="mb-3 h-4 w-4 text-amber-600" />
              {alert}
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
