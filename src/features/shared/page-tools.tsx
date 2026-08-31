import { Search } from "lucide-react";
import { ReactNode } from "react";
import { Input } from "@/components/ui/input";

export function PageTools({ action }: { action: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      
      {action}
    </div>
  );
}
