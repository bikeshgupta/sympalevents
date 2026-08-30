import { Card, CardContent } from "@/components/ui/card";

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">Module route is ready for the next implementation phase.</p>
      </div>
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          This screen will use the same CRUD, mobile card, search, filter, and permission patterns as the first modules.
        </CardContent>
      </Card>
    </div>
  );
}
