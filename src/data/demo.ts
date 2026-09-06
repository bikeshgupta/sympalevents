export const demoEvent = {
  name: "Ganesh Chaturthi 2026",
  dates: "14-16 September 2026",
  location: "Tru WindChimes",
  startDate: "2026-09-14",
  endDate: "2026-09-16",
  timezone: "Asia/Kolkata",
  heroImageUrl: null,
  status: "planning",
};

export const demoFinancials = {
  totalBudget: 148500,
  actualExpenses: 11500,
  contributionExpected: 5000,
  contributionReceived: 5000,
  sponsorshipCommitted: 36300,
  sponsorshipReceived: 36300,
};

export const contributionRows = [
  {
    flat: "A-101",
    name: "Aarav Sharma",
    type: "Owner",
    expected: 1000,
    received: 1000,
    paymentDate: "2026-09-14",
    status: "Received",
    mode: "UPI",
    reference: "UPI-101",
    createdAt: "2026-09-01T09:15:00Z",
  },
  {
    flat: "B-204",
    name: "Meera Iyer",
    type: "Tenant",
    expected: 1000,
    received: 500,
    paymentDate: "2026-09-15",
    status: "Committed",
    mode: "Cash",
    reference: "",
    createdAt: "2026-09-02T11:40:00Z",
  },
  {
    flat: "C-308",
    name: "Rohan Desai",
    type: "Owner",
    expected: 1000,
    received: 0,
    paymentDate: "-",
    status: "Committed",
    mode: "-",
    reference: "",
    createdAt: "2026-09-03T08:05:00Z",
  },
];

export const sponsorRows = [
  {
    name: "Patel Family",
    flat: "A-302",
    contact: "9000000010",
    category: "Decoration",
    item: "Flowers",
    committed: 15000,
    received: 15000,
    status: "Received",
    inKind: false,
  },
  {
    name: "WindChimes Cultural Group",
    flat: "",
    contact: "9000000011",
    category: "Prasad",
    item: "Day 2",
    committed: 5100,
    received: 5100,
    status: "Received",
    inKind: true,
  },
  {
    name: "Rao Family",
    flat: "C-110",
    contact: "9000000012",
    category: "Sound",
    item: "Evening aarti",
    committed: 8000,
    received: 0,
    status: "Confirmed",
    inKind: false,
  },
];

export const budgetRows = [
  {
    category: "Idol",
    item: "Idol booking",
    qty: 1,
    unit: "lot",
    unitCost: 15000,
    actual: 5000,
    fundingType: "Common Fund",
    status: "Booked",
  },
  {
    category: "Decoration",
    item: "Mandap and flowers",
    qty: 1,
    unit: "lot",
    unitCost: 34000,
    actual: 0,
    fundingType: "Sponsor",
    status: "Planned",
  },
  {
    category: "Prasad",
    item: "Daily prasad",
    qty: 3,
    unit: "day",
    unitCost: 10000,
    actual: 6500,
    fundingType: "Common Fund",
    status: "In Progress",
  },
];

export const taskRows = [
  { task: "Confirm idol delivery", owner: "Aarav", priority: "Critical", due: "2026-09-10", status: "In Progress" },
  { task: "Finalize prasad menu", owner: "Meera", priority: "High", due: "2026-09-08", status: "Not Started" },
  { task: "Volunteer briefing", owner: "Rohan", priority: "Medium", due: "2026-09-13", status: "Blocked" },
];

export const expenseRows = [
  {
    date: "2026-09-10",
    category: "Idol",
    item: "Booking advance",
    amount: 5000,
    paidBy: "Aarav",
    mode: "UPI",
    type: "Advance",
    sponsored: false,
    approvedBy: "Committee",
    notes: "",
  },
  {
    date: "2026-09-12",
    category: "Prasad",
    item: "Dry fruits",
    amount: 6500,
    paidBy: "Meera",
    mode: "Cash",
    type: "Purchase",
    sponsored: false,
    approvedBy: "Treasurer",
    notes: "",
  },
];

export const eventPlanRows = [
  {
    day: "Day 1",
    date: "2026-09-14",
    activity: "Ganesh sthapana",
    // Agenda lines are "time | title | note" - see src/lib/agenda.ts. The
    // demo carries timed items so demo mode shows the same timeline detail
    // a real event does.
    subEvents:
      "08:30 | Idol arrival and welcome | Meet at the gate\n09:00-09:30 | Sthapana and sankalp | Pandit ji leads\n09:30 | Opening aarti\n10:00-11:00 | Prasad counter | Modak and pedha",
    startTime: "09:00",
    endTime: "10:30",
    location: "Clubhouse",
    attendance: 80,
    owner: "Aarav",
    status: "Planned",
    notes: "",
  },
  {
    day: "Day 2",
    date: "2026-09-15",
    activity: "Evening aarti and prasad",
    subEvents:
      "19:00-19:45 | Bhajan session | Society choir\n19:45 | Sandhya aarti\n20:00 | Pushpanjali\n20:15-21:00 | Prasad distribution | Counter closes at 9",
    startTime: "19:00",
    endTime: "21:00",
    location: "Central lawn",
    attendance: 120,
    owner: "Meera",
    status: "Planned",
    notes: "",
  },
  {
    day: "Day 3",
    date: "2026-09-16",
    activity: "Cultural programme",
    subEvents:
      "19:00 | Welcome and lamp lighting\n19:15 | Kids dance - juniors\n19:40 | Solo singing\n20:00 | Ladies group dance\n20:30 | Prize distribution\n20:45 | Group aarti",
    startTime: "19:00",
    endTime: "21:00",
    location: "Central lawn",
    attendance: 200,
    owner: "Rohit",
    status: "Planned",
    notes: "",
  },
];
