export const demoEvent = {
  name: "Ganesh Chaturthi 2026",
  dates: "14-16 September 2026",
  location: "Tru WindChimes",
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
