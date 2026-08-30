import { useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getFirstEventId, useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import { CrudDialog, formNumber, formString } from "@/features/shared/crud-dialog";
import { PageTools } from "@/features/shared/page-tools";
import { RowActions } from "@/features/shared/row-actions";

export function ContributionsPage() {
  const { data } = useEventData();
  const access = usePageAccess("contributions");
  const queryClient = useQueryClient();
  const contributionRows = data.contributions;
  const expected = contributionRows.reduce((sum, row) => sum + row.expected, 0);
  const received = contributionRows.reduce((sum, row) => sum + row.received, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Contributions</h2>
          <p className="text-sm text-muted-foreground">Track resident interest, expected amount, collections, and payment mode.</p>
        </div>
        <div className="flex items-center gap-2">
          <DataSourceBadge source={data.source} reason={data.fallbackReason} />
          <Button variant="outline">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Flats" value={String(contributionRows.length)} icon={Download} />
        <StatCard title="Expected" value={formatCurrency(expected)} icon={Download} />
        <StatCard title="Received" value={formatCurrency(received)} icon={Download} />
        <StatCard title="Pending" value={formatCurrency(expected - received)} icon={Download} />
      </section>
      <PageTools
        action={
          access.canEdit ? <CrudDialog title="Add Contribution" triggerLabel="Add Contribution" onSubmit={addContribution}>
            <FormField label="Flat No" name="flat" required />
            <FormField label="Resident Name" name="name" required />
            <FormField label="Owner/Tenant" name="type" defaultValue="Owner" />
            <FormField label="Expected Contribution" name="expected" type="number" required />
            <FormField label="Received" name="received" type="number" defaultValue={0} />
            <FormField label="Payment Mode" name="mode" defaultValue="UPI" />
            <FormField label="Status" name="status" defaultValue="Pending" />
            <FormField label="Reference" name="reference" />
          </CrudDialog> : <span className="text-sm text-muted-foreground">View-only access</span>
        }
      />
      <div className="grid gap-3 lg:hidden">
        {contributionRows.map((row) => (
          <Card key={row.flat}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-sm text-muted-foreground">{row.flat} · {row.type}</p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span>Expected {formatCurrency(row.expected)}</span>
                <span>Received {formatCurrency(row.received)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="hidden overflow-hidden lg:block">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              {["Flat", "Resident", "Type", "Expected", "Received", "Mode", "Status", ""].map((head) => (
                <th key={head} className="px-4 py-3 font-medium">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contributionRows.map((row) => (
              <tr key={row.flat} className="border-t">
                <td className="px-4 py-3">{row.flat}</td>
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3">{row.type}</td>
                <td className="px-4 py-3">{formatCurrency(row.expected)}</td>
                <td className="px-4 py-3">{formatCurrency(row.received)}</td>
                <td className="px-4 py-3">{row.mode}</td>
                <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                <td className="px-4 py-3">
                  {row.id && access.canEdit ? (
                    <RowActions
                      onEdit={async () => {
                        const received = window.prompt("Received amount", String(row.received));
                        if (received === null) return;
                        await updateContribution(row.id!, Number(received));
                        await queryClient.invalidateQueries({ queryKey: ["event-data"] });
                      }}
                      onDelete={async () => {
                        if (!window.confirm("Delete this contribution?")) return;
                        await deleteContribution(row.id!);
                        await queryClient.invalidateQueries({ queryKey: ["event-data"] });
                      }}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

async function addContribution(formData: FormData) {
  if (!supabase) throw new Error("Supabase is not configured");
  const eventId = await getFirstEventId();

  const { data: resident, error: residentError } = await supabase
    .from("residents")
    .insert({
      event_id: eventId,
      flat_no: formString(formData, "flat"),
      resident_name: formString(formData, "name"),
      resident_type: formString(formData, "type", "Owner"),
      interested: true,
    })
    .select("id")
    .single();

  if (residentError) throw residentError;

  const { error } = await supabase.from("contributions").insert({
    event_id: eventId,
    resident_id: resident.id,
    expected_amount: formNumber(formData, "expected"),
    received_amount: formNumber(formData, "received"),
    payment_mode: formString(formData, "mode", "UPI"),
    status: formString(formData, "status", "Pending"),
    reference: formString(formData, "reference"),
  });

  if (error) throw error;
}

async function updateContribution(id: string, receivedAmount: number) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("contributions").update({ received_amount: receivedAmount }).eq("id", id);
  if (error) throw error;
}

async function deleteContribution(id: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("contributions").delete().eq("id", id);
  if (error) throw error;
}
