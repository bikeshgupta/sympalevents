import {
  CalendarDays,
  ClipboardList,
  CircleDollarSign,
  Contact,
  Gauge,
  LayoutDashboard,
  Megaphone,
  MessageSquareText,
  ScanLine,
  Gavel,
  HandCoins,
  HeartHandshake,
  ListChecks,
  PartyPopper,
  ReceiptIndianRupee,
  Settings,
  Users,
  Utensils,
} from "lucide-react";

export const navItems = [
  // Only ever offered to an organiser: the server lists it for admins and
  // committee members and for nobody else, and the nav shows what it lists.
  { label: "Command centre", href: "/command", icon: LayoutDashboard },
  { label: "Communications", href: "/communications", icon: MessageSquareText },
  { label: "Overview", href: "/dashboard", icon: Gauge },
  { label: "Updates", href: "/updates", icon: Megaphone },
  { label: "Participate", href: "/registration", icon: Users },
  { label: "Gate", href: "/gate", icon: ScanLine },
  { label: "Contributions", href: "/contributions", icon: HandCoins },
  { label: "Sponsors", href: "/sponsors", icon: HeartHandshake },
  { label: "Budget", href: "/budget", icon: CircleDollarSign },
  { label: "Expenses", href: "/expenses", icon: ReceiptIndianRupee },
  { label: "Auctions", href: "/auctions", icon: Gavel },
  { label: "Prasad", href: "/prasad", icon: Utensils },
  { label: "Tasks", href: "/tasks", icon: ListChecks },
  { label: "Volunteers", href: "/volunteers", icon: Users },
  { label: "Events", href: "/event-plan", icon: CalendarDays },
  { label: "Teams", href: "/teams", icon: Users },
  { label: "Fixtures", href: "/fixtures", icon: ClipboardList },
  { label: "Contacts", href: "/contacts", icon: Contact },
  { label: "Closing", href: "/closing", icon: PartyPopper },
  { label: "Settings", href: "/settings", icon: Settings },
];

// Removed for now (not needed at this stage): Procurement, Run Sheet,
// Inventory, Vendors, Safety. Re-add a { label, href, icon } row here to
// bring one back - the routes and page-access keys were removed too, so
// check app.tsx / page-access.ts / api/event-access.ts if you do.
