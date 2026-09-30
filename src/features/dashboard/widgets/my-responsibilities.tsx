import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { formatEventDate } from "@/features/dashboard/dashboard-utils";
import { useMyTasks } from "@/lib/tasks";

export function MyResponsibilities({ eventId, signedIn }: { eventId?: string; signedIn: boolean }) {
  // Resolved by real assignment now (task_assignees), not by matching the
  // signed-in person's name against the free-text owner column - see
  // api/tasks.ts. Same card, an answer that is actually reliable.
  const { data } = useMyTasks(eventId, signedIn);
  const responsibilities = data?.tasks ?? [];

  if (!signedIn || !responsibilities.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>My Responsibilities</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {responsibilities.slice(0, 4).map((item) => (
          <Link
            key={item.id}
            to="/tasks"
            className="block rounded-md border bg-background p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              {item.dueDate ? formatEventDate(item.dueDate) : "Date TBC"}
            </p>
            <p className="mt-1 font-medium">{item.task}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.status}
              {item.commentCount ? ` · ${item.commentCount} comment${item.commentCount === 1 ? "" : "s"}` : ""}
            </p>
          </Link>
        ))}
        {responsibilities.length > 4 ? (
          <Link to="/tasks" className="block text-sm font-medium text-primary underline underline-offset-2">
            +{responsibilities.length - 4} more on the Tasks page
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
