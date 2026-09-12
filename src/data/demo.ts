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
    // Agenda lines are one point per line - see src/lib/agenda.ts. The demo
    // carries them so demo mode shows the same timeline detail a real event does.
    subEvents:
      "Idol arrival and welcome at the gate\nSthapana and sankalp - Pandit ji leads\nOpening aarti\nPrasad counter - modak and pedha",
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
      "Bhajan session by the society choir\nSandhya aarti\nPushpanjali\nPrasad distribution - counter closes at 9",
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
      "Welcome and lamp lighting\nKids dance - juniors\nSolo singing\nLadies group dance\nPrize distribution\nGroup aarti",
    startTime: "19:00",
    endTime: "21:00",
    location: "Central lawn",
    attendance: 200,
    owner: "Rohit",
    status: "Planned",
    notes: "",
  },
];

// Prasad for demo mode - the shape src/lib/prasad.ts reads. The first two
// share one slot (a slot holds as many prasad items as the committee likes),
// and one item has nobody distributing yet, so "Unfilled" shows in demo too.
export const prasadItemRows = [
  {
    id: "demo-prasad-1",
    date: "2026-09-14",
    slot: "Morning",
    item: "Modak",
    notes: "",
    arrangers: [
      { name: "Sharma family", flat: "A-101" },
      { name: "Meera Iyer", flat: "B-204" },
    ],
    distributors: [
      { name: "Rohan", flat: "C-302" },
      { name: "Kavya", flat: "A-108" },
    ],
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  },
  {
    id: "demo-prasad-4",
    date: "2026-09-14",
    slot: "Morning",
    item: "Pedha",
    notes: "",
    arrangers: [
      { name: "Joshi family", flat: "C-104" },
      { name: "Deshpande family", flat: "D-206" },
    ],
    distributors: [{ name: "Rohan", flat: "C-302" }],
    createdAt: "2026-09-01T00:00:03Z",
    updatedAt: "2026-09-01T00:00:03Z",
  },
  {
    id: "demo-prasad-2",
    date: "2026-09-14",
    slot: "Evening",
    item: "Sheera",
    notes: "Counter near the stage",
    arrangers: [{ name: "Patel family", flat: "D-401" }],
    distributors: [],
    createdAt: "2026-09-01T00:00:01Z",
    updatedAt: "2026-09-01T00:00:01Z",
  },
  {
    id: "demo-prasad-3",
    date: "2026-09-15",
    slot: "Noon",
    item: "Khichdi bhog",
    notes: "",
    arrangers: [
      { name: "Gupta family", flat: "B-110" },
      { name: "Nair family", flat: "C-205" },
      { name: "Aarav Sharma", flat: "A-101" },
    ],
    distributors: [
      { name: "Youth group", flat: "" },
      { name: "Priya", flat: "D-402" },
    ],
    createdAt: "2026-09-01T00:00:02Z",
    updatedAt: "2026-09-01T00:00:02Z",
  },
];
