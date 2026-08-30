import {
  Boxes,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  Contact,
  Gauge,
  HandCoins,
  HeartHandshake,
  ListChecks,
  PackageCheck,
  ReceiptIndianRupee,
  Settings,
  ShieldAlert,
  Store,
  Users,
  Utensils,
} from "lucide-react";

export const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge },
  { label: "Contributions", href: "/contributions", icon: HandCoins },
  { label: "Sponsors", href: "/sponsors", icon: HeartHandshake },
  { label: "Budget", href: "/budget", icon: CircleDollarSign },
  { label: "Expenses", href: "/expenses", icon: ReceiptIndianRupee },
  { label: "Procurement", href: "/procurement", icon: PackageCheck },
  { label: "Prasad", href: "/prasad", icon: Utensils },
  { label: "Tasks", href: "/tasks", icon: ListChecks },
  { label: "Volunteers", href: "/volunteers", icon: Users },
  { label: "Event Plan", href: "/event-plan", icon: CalendarDays },
  { label: "Run Sheet", href: "/run-sheet", icon: ClipboardCheck },
  { label: "Inventory", href: "/inventory", icon: Boxes },
  { label: "Vendors", href: "/vendors", icon: Store },
  { label: "Contacts", href: "/contacts", icon: Contact },
  { label: "Safety", href: "/risks", icon: ShieldAlert },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const mobileNavItems = navItems.filter((item) =>
  ["Dashboard", "Contributions", "Tasks", "Procurement"].includes(item.label),
);
