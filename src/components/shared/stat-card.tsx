import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  title,
  value,
  icon: Icon,
  note,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  note?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
          {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
        </div>
        <div className="rounded-md bg-accent p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}
