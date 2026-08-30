import { Search } from "lucide-react";
import { ReactNode } from "react";
import { Input } from "@/components/ui/input";

export function PageTools({ action }: { action: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search records" />
      </div>
      {action}
    </div>
  );
}
