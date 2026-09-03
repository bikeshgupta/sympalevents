import {
  CalendarDays,
  CircleDollarSign,
  Contact,
  Gauge,
  Gavel,
  HandCoins,
  HeartHandshake,
  ListChecks,
  ReceiptIndianRupee,
  Settings,
  Users,
  Utensils,
} from "lucide-react";

export const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge },
  { label: "Contributions", href: "/contributions", icon: HandCoins },
  { label: "Sponsors", href: "/sponsors", icon: HeartHandshake },
  { label: "Budget", href: "/budget", icon: CircleDollarSign },
  { label: "Expenses", href: "/expenses", icon: ReceiptIndianRupee },
  { label: "Auctions", href: "/auctions", icon: Gavel },
  { label: "Prasad", href: "/prasad", icon: Utensils },
  { label: "Tasks", href: "/tasks", icon: ListChecks },
  { label: "Volunteers", href: "/volunteers", icon: Users },
  { label: "Events", href: "/event-plan", icon: CalendarDays },
  { label: "Contacts", href: "/contacts", icon: Contact },
  { label: "Settings", href: "/settings", icon: Settings },
];

// Removed for now (not needed at this stage): Procurement, Run Sheet,
// Inventory, Vendors, Safety. Re-add a { label, href, icon } row here to
// bring one back - the routes and page-access keys were removed too, so
// check app.tsx / page-access.ts / api/event-access.ts if you do.
