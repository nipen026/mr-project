/**
 * Fills an EMPTY database with a believable, fictional company so every screen
 * of the admin panel and the Android app has data to show.
 *
 *   npm run seed:realistic            # refuses if any company already exists
 *   npm run seed:realistic -- --reset # empties the app tables first (asks no questions)
 *
 * Uses DATABASE_URL (PostgreSQL) when set, otherwise DATABASE_PATH (SQLite).
 * Output is deterministic: the same run produces the same people and activity.
 */
import { randomUUID } from "node:crypto";
import { Store, tableOrder } from "../apps/api/src/db.ts";
import { hashPassword } from "../apps/api/src/auth.ts";
import { distanceMeters, today } from "../apps/api/src/service.ts";
import { defaultPolicies } from "../packages/shared/src/index.ts";
export const password = "Demo-only-2026!";
// ---- deterministic randomness ------------------------------------------------
let state = 20261028;
const rnd = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const chance = (p: number) => rnd() < p;
const pick = <T>(list: readonly T[]): T =>
  list[Math.floor(rnd() * list.length)];
const id = () => randomUUID();
const round2 = (n: number) => Math.round(n * 100) / 100;
// ---- dates (business dates are Asia/Kolkata) ---------------------------------
const addDays = (date: string, n: number) => {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isSunday = (date: string) =>
  new Date(date + "T00:00:00Z").getUTCDay() === 0;
/** ISO instant for an IST wall-clock time on a business date. */
const ist = (date: string, hours: number, minutes = 0) =>
  new Date(
    Date.parse(date + "T00:00:00+05:30") + (hours * 60 + minutes) * 60000,
  ).toISOString();
const TODAY = today();
const NOW = Date.now();
// ---- reference data ----------------------------------------------------------
const HQS = [
  {
    key: "delhi",
    name: "Delhi HQ",
    zone: "North zone",
    state: "Delhi",
    lat: 28.6139,
    lng: 77.209,
    areas: [
      "Karol Bagh",
      "Rajouri Garden",
      "Laxmi Nagar",
      "Dwarka",
      "Rohini",
      "Pitampura",
      "Janakpuri",
      "Saket",
    ],
  },
  {
    key: "gurugram",
    name: "Gurugram HQ",
    zone: "North zone",
    state: "Haryana",
    lat: 28.4595,
    lng: 77.0266,
    areas: [
      "Sector 14",
      "DLF Phase 2",
      "Sohna Road",
      "Sushant Lok",
      "Golf Course Road",
      "Palam Vihar",
    ],
  },
  {
    key: "noida",
    name: "Noida HQ",
    zone: "North zone",
    state: "Uttar Pradesh",
    lat: 28.5355,
    lng: 77.391,
    areas: [
      "Sector 18",
      "Sector 62",
      "Indirapuram",
      "Vaishali",
      "Greater Noida",
    ],
  },
  {
    key: "mumbai",
    name: "Mumbai HQ",
    zone: "West zone",
    state: "Maharashtra",
    lat: 19.076,
    lng: 72.8777,
    areas: [
      "Andheri",
      "Bandra",
      "Borivali",
      "Dadar",
      "Powai",
      "Malad",
      "Ghatkopar",
    ],
  },
  {
    key: "thane",
    name: "Thane HQ",
    zone: "West zone",
    state: "Maharashtra",
    lat: 19.2183,
    lng: 72.9781,
    areas: ["Naupada", "Ghodbunder Road", "Kopri", "Vartak Nagar", "Dombivli"],
  },
  {
    key: "pune",
    name: "Pune HQ",
    zone: "West zone",
    state: "Maharashtra",
    lat: 18.5204,
    lng: 73.8567,
    areas: ["Kothrud", "Baner", "Hadapsar", "Viman Nagar", "Pimpri", "Aundh"],
  },
] as const;
type Hq = (typeof HQS)[number];
const PEOPLE: {
  id: string;
  name: string;
  role: "admin" | "manager" | "rep";
  manager: string | null;
  hq: string;
}[] = [
  {
    id: "admin",
    name: "Anjali Gupta",
    role: "admin",
    manager: null,
    hq: "delhi",
  },
  {
    id: "manager",
    name: "Anirudh Kumar",
    role: "manager",
    manager: "admin",
    hq: "delhi",
  },
  {
    id: "kavita",
    name: "Kavita Rao",
    role: "manager",
    manager: "admin",
    hq: "mumbai",
  },
  {
    id: "aman",
    name: "Aman Sharma",
    role: "rep",
    manager: "manager",
    hq: "delhi",
  },
  {
    id: "priya",
    name: "Priya Singh",
    role: "rep",
    manager: "manager",
    hq: "delhi",
  },
  {
    id: "rohit",
    name: "Rohit Mehra",
    role: "rep",
    manager: "manager",
    hq: "gurugram",
  },
  {
    id: "sneha",
    name: "Sneha Iyer",
    role: "rep",
    manager: "manager",
    hq: "gurugram",
  },
  {
    id: "vikram",
    name: "Vikram Joshi",
    role: "rep",
    manager: "manager",
    hq: "noida",
  },
  {
    id: "deepa",
    name: "Deepa Nair",
    role: "rep",
    manager: "manager",
    hq: "noida",
  },
  {
    id: "arjun",
    name: "Arjun Reddy",
    role: "rep",
    manager: "kavita",
    hq: "mumbai",
  },
  {
    id: "pooja",
    name: "Pooja Bansal",
    role: "rep",
    manager: "kavita",
    hq: "mumbai",
  },
  {
    id: "imran",
    name: "Imran Khan",
    role: "rep",
    manager: "kavita",
    hq: "thane",
  },
  {
    id: "neha",
    name: "Neha Chauhan",
    role: "rep",
    manager: "kavita",
    hq: "thane",
  },
  {
    id: "sandeep",
    name: "Sandeep Yadav",
    role: "rep",
    manager: "kavita",
    hq: "pune",
  },
  {
    id: "ritu",
    name: "Ritu Malhotra",
    role: "rep",
    manager: "kavita",
    hq: "pune",
  },
];
const FIRST = [
  "Rajesh",
  "Sunita",
  "Anil",
  "Meena",
  "Vivek",
  "Anjali",
  "Suresh",
  "Kavya",
  "Manoj",
  "Rekha",
  "Harish",
  "Pallavi",
  "Naveen",
  "Shalini",
  "Prakash",
  "Divya",
  "Ramesh",
  "Nidhi",
  "Sanjay",
  "Swati",
  "Ashok",
  "Bhavna",
  "Girish",
  "Madhuri",
  "Tarun",
  "Seema",
  "Yogesh",
  "Lata",
  "Dinesh",
  "Farah",
  "Irfan",
  "Zoya",
  "Gurpreet",
  "Harleen",
  "Kiran",
  "Mahesh",
  "Neeraj",
  "Omkar",
  "Pankaj",
  "Radhika",
];
const LAST = [
  "Verma",
  "Kapoor",
  "Agarwal",
  "Malhotra",
  "Bhatia",
  "Saxena",
  "Mishra",
  "Pandey",
  "Desai",
  "Kulkarni",
  "Patil",
  "Joshi",
  "Menon",
  "Pillai",
  "Chopra",
  "Arora",
  "Sinha",
  "Banerjee",
  "Ghosh",
  "Shah",
  "Mehta",
  "Naidu",
  "Rao",
  "Qureshi",
  "Siddiqui",
  "Gill",
  "Sethi",
  "Bajaj",
  "Tiwari",
  "Dubey",
];
const SPECIALTIES = [
  "General physician",
  "Gynaecologist",
  "Paediatrician",
  "Cardiologist",
  "Diabetologist",
  "Dermatologist",
  "Orthopaedic",
  "ENT specialist",
  "Pulmonologist",
  "Neurologist",
  "Gastroenterologist",
  "Consultant physician",
];
const QUALS = [
  "MBBS",
  "MBBS, MD",
  "MBBS, DNB",
  "MBBS, DGO",
  "MBBS, DCH",
  "MBBS, MS",
  "BAMS",
];
const PRODUCTS = [
  ["CardioCare 10", "CC-010", 240, "Cardiology"],
  ["GlucoBalance 500", "GB-500", 118, "Diabetology"],
  ["GastroEase DSR", "GE-030", 130, "Gastroenterology"],
  ["VitaD Plus", "VD-060", 95, "Nutrition"],
  ["Painrelief SR", "PR-100", 76, "Pain management"],
  ["Respira Syrup", "RS-100", 88, "Respiratory"],
  ["DermaSoft Cream", "DS-030", 142, "Dermatology"],
  ["NeuroCalm 75", "NC-075", 310, "Neurology"],
  ["Pedia Zinc Drops", "PZ-015", 64, "Paediatrics"],
  ["FemCare Iron", "FI-090", 99, "Gynaecology"],
] as const;
const INPUTS = [
  ["Patient education leaflet", "IN-01", 5],
  ["Prescription pad", "IN-02", 12],
  ["Detailing aid folder", "IN-03", 22],
  ["Desk calendar", "IN-04", 35],
  ["Branded pen", "IN-05", 8],
] as const;
const COMPETITORS = [
  "Cardivas",
  "Glycomet",
  "Pantocid",
  "Shelcal",
  "Combiflam",
  "Ascoril",
  "Candid",
  "Gabapin",
  "Zincovit",
  "Autrin",
];
const REMARKS = [
  "Discussed efficacy data and left a detailing aid. Doctor interested in follow-up.",
  "Reviewed last month prescriptions; agreed to trial the new strength.",
  "Short visit, doctor busy with patients. Left samples and promised a callback.",
  "Addressed a query on side effects. Doctor satisfied with the explanation.",
  "Chemist confirmed stock availability and booked the monthly order.",
  "Joint call with the manager. Positive feedback on the product range.",
  "Doctor asked for the latest clinical study; will share on the next visit.",
  "Competitor discount mentioned. Highlighted our quality and patient outcomes.",
  "Updated the clinic on the new campaign and shared leaflets.",
  "Follow-up on previous order; delivery confirmed by the stockist.",
];
const EXCEPTIONS = [
  "Clinic is on an upper floor, GPS drifted. Doctor confirmed the visit.",
  "Poor network at the basement clinic; location could not be fixed in time.",
  "Customer shifted to a new building nearby; master location needs correction.",
  "Visited at the residence chamber, not the clinic address.",
  "Phone GPS was recovering after a tunnel; accuracy was low.",
];
// ---- row collectors ----------------------------------------------------------
type Row = unknown[];
const out: Record<string, Row[]> = {};
const add = (table: string, ...row: Row) => (out[table] ??= []).push(row);
const record = (
  kind: string,
  owner: string,
  status: string,
  data: Record<string, unknown>,
  created: string,
  version = 1,
) => {
  const rid = id();
  add(
    "records",
    rid,
    TENANT,
    kind,
    owner,
    status,
    version,
    JSON.stringify(data),
    created,
    created,
    0,
  );
  add("audit", id(), TENANT, owner, kind + ".created", rid, "{}", created);
  return rid;
};
const decision = (
  recordId: string,
  actor: string,
  action: string,
  reason: string,
  at: string,
) => add("decisions", id(), TENANT, recordId, actor, action, reason, at);
const TENANT = "tenant-vidya";
// ---- generation --------------------------------------------------------------
async function build() {
  const hash = await hashPassword(password);
  add(
    "tenants",
    TENANT,
    "VIDYA",
    "Vidya Pharmaceuticals · Demo workspace",
    JSON.stringify(defaultPolicies),
  );
  const hq = new Map<string, Hq>(HQS.map((h) => [h.key, h]));
  // territories
  const territory = new Map<string, string>();
  for (const h of HQS)
    territory.set(
      h.key,
      record(
        "territory",
        "admin",
        "active",
        {
          name: h.name,
          zone: h.zone,
          state: h.state,
          division: "Pharma division",
        },
        ist(addDays(TODAY, -120), 10),
      ),
    );
  for (const p of PEOPLE)
    add(
      "users",
      p.id,
      TENANT,
      p.id + "@mrconnect.test",
      p.name,
      p.role,
      p.manager,
      territory.get(p.hq),
      hash,
      1,
      0,
      1,
    );
  // products and inputs
  const products = PRODUCTS.map(([name, code, price, category]) => ({
    id: record(
      "product",
      "admin",
      "active",
      {
        name,
        code,
        price,
        category,
        description:
          "Approved detailing notes for " +
          name +
          ". Fictional demonstration content.",
      },
      ist(addDays(TODAY, -110), 10),
    ),
    name,
    price: price as number,
  }));
  const inputs = INPUTS.map(([name, code, unitCost]) => ({
    id: record(
      "input",
      "admin",
      "active",
      { name, code, unitCost },
      ist(addDays(TODAY, -110), 11),
    ),
    name,
  }));
  // routes: two per HQ
  const routes = new Map<string, { id: string; name: string }[]>();
  for (const h of HQS) {
    const list = [0, 1].map((i) => {
      const via = h.areas.slice(i * 2, i * 2 + 3);
      const name = `${h.name.replace(" HQ", "")} · ${i === 0 ? "Local" : "Extended"} route`;
      return {
        id: record(
          "route",
          "admin",
          "active",
          {
            name,
            origin: h.name,
            viaLocations: via.join("\n"),
            distanceKm: i === 0 ? int(18, 34) : int(48, 90),
            allowanceType: i === 0 ? "Local" : "Ex-station",
            frequency: 4,
          },
          ist(addDays(TODAY, -105), 10),
        ),
        name,
      };
    });
    routes.set(h.key, list);
  }
  // customers
  type Customer = {
    id: string;
    name: string;
    type: string;
    assignedTo: string;
    hq: string;
    lat: number;
    lng: number;
    freq: number;
    route: string;
  };
  const customers: Customer[] = [];
  const mkCustomer = (
    rep: (typeof PEOPLE)[number],
    type: string,
    n: number,
  ) => {
    const h = hq.get(rep.hq)!;
    const area = pick(h.areas);
    const lat = Math.round((h.lat + (rnd() - 0.5) * 0.14) * 1e4) / 1e4;
    const lng = Math.round((h.lng + (rnd() - 0.5) * 0.14) * 1e4) / 1e4;
    const cls = pick(["A+", "A", "A", "B", "B", "B", "C"]);
    const freq = ({ "A+": 4, A: 3, B: 2, C: 1 } as Record<string, number>)[cls];
    const person = `${pick(FIRST)} ${pick(LAST)}`;
    const route = pick(routes.get(rep.hq)!);
    const base: Record<string, unknown> = {
      type,
      assignedTo: rep.id,
      routeId: route.id,
      area,
      class: cls,
      frequency: freq,
      state: h.state,
      pinCode: String(100000 + int(0, 899999)),
      latitude: lat,
      longitude: lng,
      mobile: "9" + String(int(100000000, 999999999)),
    };
    let name: string;
    if (type === "Doctor") {
      name = "Dr. " + person;
      Object.assign(base, {
        specialty: pick(SPECIALTIES),
        qualification: pick(QUALS),
        gender: pick(["Female", "Male"]),
        clinicAddress: `${int(1, 240)}, ${area} Main Road, ${h.name.replace(" HQ", "")}`,
        residenceAddress: chance(0.4)
          ? `${int(1, 90)}, ${pick(h.areas)}, ${h.name.replace(" HQ", "")}`
          : undefined,
      });
    } else if (type === "Chemist") {
      name = `${pick(["City", "Sai", "Apollo", "Shree", "Care", "Jan", "Wellness", "Health", "Life", "Medico"])} ${pick(["Pharmacy", "Medicos", "Medical Store", "Chemists"])} ${area.split(" ")[0]}`;
      Object.assign(base, {
        specialty: "Retail pharmacy",
        clinicAddress: `Shop ${int(1, 60)}, ${area}, ${h.name.replace(" HQ", "")}`,
      });
    } else if (type === "Hospital") {
      name = `${pick(["Sunrise", "Lifeline", "Medicare", "Apex", "Unity", "Heritage"])} Hospital ${area.split(" ")[0]}`;
      Object.assign(base, {
        specialty: "Multispecialty",
        clinicAddress: `${area}, ${h.name.replace(" HQ", "")}`,
      });
    } else {
      name = `${pick(FIRST)} ${pick(["Distributors", "Pharma Agencies", "Traders", "Drug House"])}`;
      Object.assign(base, {
        specialty: "Distribution",
        clinicAddress: `Godown ${int(1, 30)}, ${area}, ${h.name.replace(" HQ", "")}`,
      });
    }
    base.name = name;
    const cid = record(
      "customer",
      rep.id,
      "active",
      Object.fromEntries(
        Object.entries(base).filter(([, v]) => v !== undefined),
      ),
      ist(addDays(TODAY, -100 + (n % 7)), 11),
    );
    customers.push({
      id: cid,
      name,
      type,
      assignedTo: rep.id,
      hq: rep.hq,
      lat,
      lng,
      freq,
      route: route.id,
    });
  };
  const reps = PEOPLE.filter((p) => p.role === "rep");
  for (const rep of reps) {
    for (let i = 0; i < 30; i++) mkCustomer(rep, "Doctor", i);
    for (let i = 0; i < 8; i++) mkCustomer(rep, "Chemist", i);
  }
  for (const [i, rep] of reps.entries()) {
    if (i % 2 === 0) mkCustomer(rep, "Hospital", i);
    if (i % 3 === 0) mkCustomer(rep, "Stockist", i);
  }
  // campaigns
  const doctors = customers.filter((c) => c.type === "Doctor");
  const campaign = (
    name: string,
    from: number,
    to: number,
    desc: string,
    n: number,
  ) => {
    const chosen = [...doctors].sort(() => rnd() - 0.5).slice(0, n);
    return {
      id: record(
        "campaign",
        "admin",
        "active",
        {
          name,
          fromDate: addDays(TODAY, from),
          toDate: addDays(TODAY, to),
          productIds: products.slice(0, 4).map((p) => p.id),
          customerIds: chosen.map((c) => c.id),
          description: desc,
        },
        ist(addDays(TODAY, Math.min(from, -1) - 3), 10),
      ),
      doctors: new Set(chosen.map((c) => c.id)),
      from: addDays(TODAY, from),
      to: addDays(TODAY, to),
    };
  };
  const live = campaign(
    "Monsoon Wellness Drive",
    -22,
    24,
    "Focus on seasonal respiratory and gastro care with doctor education material.",
    60,
  );
  campaign(
    "Diabetes Awareness Month",
    -75,
    -20,
    "Completed awareness drive on early diabetes screening.",
    45,
  );
  campaign(
    "Winter Cardiac Care",
    12,
    55,
    "Upcoming campaign on cardiac risk management for the winter season.",
    50,
  );
  // announcements
  for (const [i, [title, body]] of (
    [
      [
        "Q3 targets announced",
        "Quarterly targets are live. Check your territory plan and talk to your manager for any adjustments.",
      ],
      [
        "Reporting reminder",
        "Submit your daily call reports within seven days. Returned reports must be corrected and resubmitted.",
      ],
      [
        "New product training",
        "Join the Thursday product training for NeuroCalm 75. Detailing aids are available in the app.",
      ],
      [
        "Monsoon Wellness Drive",
        "The campaign is live. Record campaign visits against the campaign so coverage is tracked.",
      ],
    ] as const
  ).entries())
    record(
      "announcement",
      "admin",
      "active",
      { title, body },
      ist(addDays(TODAY, -i * 5 - 1), 9),
    );
  // working days
  const days: string[] = [];
  for (let n = 25; n >= 0; n--)
    if (!isSunday(addDays(TODAY, -n))) days.push(addDays(TODAY, -n));
  const manager = new Map(PEOPLE.map((p) => [p.id, p.manager]));
  const repIndex = new Map(reps.map((p, i) => [p.id, i]));
  // starting stock
  const balance = new Map<string, number>();
  const key = (rep: string, item: string) => rep + "|" + item;
  const stock = (
    rep: string,
    type: string,
    item: string,
    qty: number,
    source: string,
    at: string,
  ) => {
    balance.set(key(rep, item), (balance.get(key(rep, item)) || 0) + qty);
    add("stock_ledger", id(), TENANT, rep, type, item, qty, source, at);
  };
  let challanNo = 1;
  for (const rep of reps) {
    for (const p of products) {
      const qty = int(220, 380);
      const rid = record(
        "challan",
        rep.id,
        "acknowledged",
        {
          name: "CH-" + String(challanNo++).padStart(4, "0"),
          date: addDays(TODAY, -26),
          recipientId: rep.id,
          itemType: "Sample",
          itemId: p.id,
          quantity: qty,
          notes: "Opening sample stock",
          receivedQty: qty,
          acknowledgedAt: ist(addDays(TODAY, -25), 12),
          acknowledgementNotes: "",
        },
        ist(addDays(TODAY, -26), 10),
      );
      stock(rep.id, "Sample", p.id, qty, rid, ist(addDays(TODAY, -25), 12));
    }
    for (const input of inputs) {
      const qty = int(150, 300);
      const rid = record(
        "challan",
        rep.id,
        "acknowledged",
        {
          name: "CH-" + String(challanNo++).padStart(4, "0"),
          date: addDays(TODAY, -26),
          recipientId: rep.id,
          itemType: "Input",
          itemId: input.id,
          quantity: qty,
          notes: "Opening input stock",
          receivedQty: qty,
          acknowledgedAt: ist(addDays(TODAY, -25), 12),
          acknowledgementNotes: "",
        },
        ist(addDays(TODAY, -26), 10),
      );
      stock(rep.id, "Input", input.id, qty, rid, ist(addDays(TODAY, -25), 12));
    }
  }
  // day plans and visits
  type Visit = {
    id: string;
    date: string;
    at: string;
    rep: string;
    customer: Customer;
  };
  const visitsByRepDay = new Map<string, Visit[]>();
  const planByRepDay = new Map<string, string>();
  const dcrByRepDay = new Map<
    string,
    { visits: number; pob: number; ids: string[] }
  >();
  const visited = new Map<string, number>();
  for (const date of days) {
    for (const rep of reps) {
      if (date === TODAY && chance(0.15)) continue;
      const myRoutes = routes.get(rep.hq)!;
      const work = chance(0.12)
        ? "Joint work"
        : chance(0.05)
          ? "Meeting"
          : "Field work";
      const planRoute = pick(myRoutes).id;
      const planId = record(
        "dayplan",
        rep.id,
        "active",
        {
          date,
          routeId: planRoute,
          workType: work,
          jointWith: work === "Joint work" ? manager.get(rep.id) : undefined,
          notes:
            work === "Meeting"
              ? "Review meeting with the manager"
              : "Planned doctor and chemist calls",
        },
        ist(date, 8, int(30, 59)),
      );
      planByRepDay.set(rep.id + date, planId);
      // An approved tour plan existed for most past days. About one in six
      // named a different route, which feeds the "Tour plan deviations" report.
      if (date < TODAY && repIndex.get(rep.id)! < 8 && chance(0.85)) {
        const other = myRoutes.find((r) => r.id !== planRoute)!.id;
        const tour = record(
          "tourplan",
          rep.id,
          "approved",
          {
            date,
            routeId: chance(0.17) ? other : planRoute,
            workType: work,
            notes: "Approved tour plan",
          },
          ist(addDays(date, -3), 10),
        );
        decision(
          tour,
          manager.get(rep.id)!,
          "approve",
          "",
          ist(addDays(date, -2), 11),
        );
      }
      if (work === "Meeting") continue;
      const mine = customers.filter((c) => c.assignedTo === rep.id);
      const want = date === TODAY ? int(0, 4) : int(5, 9);
      const list: Visit[] = [];
      let minute = 9 * 60 + 40 + int(0, 20);
      for (let i = 0; i < want; i++) {
        const weights = mine.map((c) =>
          Math.max(0.2, c.freq * 3 - (visited.get(c.id) || 0)),
        );
        let r = rnd() * weights.reduce((a, b) => a + b, 0);
        let c = mine[0];
        for (const [k, w] of weights.entries()) {
          r -= w;
          if (r <= 0) {
            c = mine[k];
            break;
          }
        }
        const at = ist(date, Math.floor(minute / 60), minute % 60);
        if (date === TODAY && Date.parse(at) > NOW - 300000) break;
        minute += int(45, 85);
        if (minute > 17 * 60 + 45) break;
        visited.set(c.id, (visited.get(c.id) || 0) + 1);
        const policy = defaultPolicies;
        const outcome = chance(0.88)
          ? "Met in person"
          : chance(0.65)
            ? "Not available"
            : "Follow-up only";
        // location evidence
        const roll = rnd();
        let loc: Record<string, unknown> | null;
        let reason: string | undefined;
        const around = (meters: number) => {
          const bearing = rnd() * Math.PI * 2;
          return {
            latitude: c.lat + (Math.cos(bearing) * meters) / 111320,
            longitude:
              c.lng +
              (Math.sin(bearing) * meters) /
                (111320 * Math.cos((c.lat * Math.PI) / 180)),
          };
        };
        if (roll < 0.86)
          loc = {
            ...around(int(10, 140)),
            accuracy: int(5, 45),
            observedAt: new Date(
              Date.parse(at) + int(-40, 40) * 1000,
            ).toISOString(),
            mocked: false,
          };
        else if (roll < 0.92) {
          loc = {
            ...around(int(260, 1400)),
            accuracy: int(8, 60),
            observedAt: at,
            mocked: false,
          };
          reason = pick(EXCEPTIONS);
        } else if (roll < 0.96) {
          loc = {
            ...around(int(20, 120)),
            accuracy: int(130, 320),
            observedAt: at,
            mocked: false,
          };
          reason = pick(EXCEPTIONS);
        } else if (roll < 0.975) {
          loc = {
            ...around(int(10, 90)),
            accuracy: 8,
            observedAt: at,
            mocked: true,
          };
          reason = "Location app flagged by device; manager review requested.";
        } else {
          loc = null;
          reason = "No GPS signal inside the building.";
        }
        const distance = loc
          ? Math.round(
              distanceMeters(
                loc.latitude as number,
                loc.longitude as number,
                c.lat,
                c.lng,
              ),
            )
          : null;
        const verified =
          !!loc &&
          !loc.mocked &&
          (loc.accuracy as number) <= policy.maxAccuracyMeters &&
          Math.abs(Date.parse(loc.observedAt as string) - Date.parse(at)) <=
            120000 &&
          distance !== null &&
          distance <= policy.gpsRadiusMeters;
        const met = outcome === "Met in person";
        const lines: {
          itemId: string;
          quantity: number;
          unitPrice: number;
          total: number;
        }[] = [];
        if (
          met &&
          chance(c.type === "Chemist" ? 0.7 : c.type === "Doctor" ? 0.22 : 0.5)
        ) {
          for (const p of [...products]
            .sort(() => rnd() - 0.5)
            .slice(0, int(1, 3))) {
            const quantity =
              c.type === "Chemist" || c.type === "Stockist"
                ? int(10, 60)
                : int(2, 12);
            lines.push({
              itemId: p.id,
              quantity,
              unitPrice: p.price,
              total: round2(p.price * quantity),
            });
          }
        }
        const samples: { itemId: string; quantity: number }[] = [];
        if (met && c.type === "Doctor" && chance(0.55))
          for (const p of [...products]
            .sort(() => rnd() - 0.5)
            .slice(0, int(1, 3))) {
            const quantity = int(2, 6);
            if ((balance.get(key(rep.id, p.id)) || 0) >= quantity) {
              samples.push({ itemId: p.id, quantity });
              balance.set(
                key(rep.id, p.id),
                (balance.get(key(rep.id, p.id)) || 0) - quantity,
              );
            }
          }
        const inputUse: { itemId: string; quantity: number }[] = [];
        if (met && chance(0.3)) {
          const input = pick(inputs);
          const quantity = int(1, 4);
          if ((balance.get(key(rep.id, input.id)) || 0) >= quantity) {
            inputUse.push({ itemId: input.id, quantity });
            balance.set(
              key(rep.id, input.id),
              (balance.get(key(rep.id, input.id)) || 0) - quantity,
            );
          }
        }
        const inCampaign =
          live.doctors.has(c.id) &&
          date >= live.from &&
          date <= live.to &&
          chance(0.7);
        const orderTotal = round2(lines.reduce((a, l) => a + l.total, 0));
        const data: Record<string, unknown> = {
          customerId: c.id,
          planId,
          visitedAt: at,
          remarks: pick(REMARKS),
          outcome,
          campaignId: inCampaign ? live.id : undefined,
          location: loc,
          exceptionReason: reason,
          detailedProductIds: met
            ? [...products]
                .sort(() => rnd() - 0.5)
                .slice(0, int(1, 3))
                .map((p) => p.id)
            : [],
          samples,
          inputs: inputUse,
          orderLines: lines,
          date,
          customerName: c.name,
          customerType: c.type,
          routeId: c.route,
          verified,
          distanceMeters: distance,
          orderTotal,
        };
        if (!verified && date < addDays(TODAY, -2) && chance(0.7)) {
          const accept = chance(0.65);
          data.review = {
            status: accept ? "accepted" : "flagged",
            note: accept
              ? "Reason is plausible. Accepted after speaking to the representative."
              : "Location does not match the clinic. Follow up in the next call.",
            by: manager.get(rep.id),
            byName: PEOPLE.find((p) => p.id === manager.get(rep.id))!.name,
            at: ist(addDays(date, 1), 11),
          };
        }
        const vid = record(
          "visit",
          rep.id,
          "completed",
          Object.fromEntries(
            Object.entries(data).filter(([, v]) => v !== undefined),
          ),
          at,
        );
        list.push({ id: vid, date, at, rep: rep.id, customer: c });
        for (const l of samples)
          add(
            "stock_ledger",
            id(),
            TENANT,
            rep.id,
            "Sample",
            l.itemId,
            -l.quantity,
            vid,
            at,
          );
        for (const l of inputUse)
          add(
            "stock_ledger",
            id(),
            TENANT,
            rep.id,
            "Input",
            l.itemId,
            -l.quantity,
            vid,
            at,
          );
        const agg = dcrByRepDay.get(rep.id + date) || {
          visits: 0,
          pob: 0,
          ids: [],
        };
        agg.visits++;
        agg.pob = round2(agg.pob + orderTotal);
        agg.ids.push(vid);
        dcrByRepDay.set(rep.id + date, agg);
      }
      visitsByRepDay.set(rep.id + date, list);
    }
  }
  for (const [k, v] of balance) {
    const [rep, item] = k.split("|");
    add(
      "inventory",
      TENANT,
      rep,
      products.some((p) => p.id === item) ? "Sample" : "Input",
      item,
      Math.max(0, v),
    );
  }
  // a few challans still waiting to be acknowledged
  for (const rep of reps.slice(0, 6)) {
    const p = pick(products);
    record(
      "challan",
      rep.id,
      "active",
      {
        name: "CH-" + String(challanNo++).padStart(4, "0"),
        date: addDays(TODAY, -1),
        recipientId: rep.id,
        itemType: "Sample",
        itemId: p.id,
        quantity: int(80, 160),
        notes: "Replenishment dispatch",
      },
      ist(addDays(TODAY, -1), 15),
    );
  }
  // daily call reports
  for (const [k, agg] of dcrByRepDay) {
    const rep = k.slice(0, k.length - 10);
    const date = k.slice(-10);
    const age = (Date.parse(TODAY) - Date.parse(date)) / 86400000;
    if (age <= 1 && chance(0.7)) continue; // recent days stay unreported, so Pending reports has content
    const mgr = manager.get(rep)!;
    const status =
      age <= 3
        ? pick(["draft", "pending", "draft"])
        : pick([
            "approved",
            "approved",
            "approved",
            "approved",
            "pending",
            "returned",
          ]);
    const base = {
      date,
      remarks:
        "Covered planned customers; follow-ups noted for the next visit.",
    };
    const data =
      status === "draft"
        ? base
        : {
            ...base,
            visitIds: agg.ids,
            visits: agg.visits,
            pob: agg.pob,
            expenses: 0,
          };
    const rid = record("dcr", rep, status, data, ist(date, 18, int(0, 50)));
    if (status === "approved")
      decision(rid, mgr, "approve", "", ist(addDays(date, 1), 10));
    if (status === "returned")
      decision(
        rid,
        mgr,
        "return",
        "Please add remarks for the two calls with location exceptions.",
        ist(addDays(date, 1), 10),
      );
  }
  // expenses
  const policy = defaultPolicies;
  for (const rep of reps)
    for (const date of days.filter((_, i) => i % 3 === 0)) {
      const route = pick(routes.get(rep.hq)!);
      const km = int(14, 48);
      const category = pick(["TA", "TA", "DA", "Meals", "Other"]);
      const amount =
        category === "TA"
          ? round2(km * policy.taPerKm)
          : category === "DA"
            ? policy.localDA
            : category === "Meals"
              ? int(120, 320)
              : int(80, 400);
      if (amount >= policy.receiptRequiredAbove) continue;
      const age = (Date.parse(TODAY) - Date.parse(date)) / 86400000;
      const status =
        age < 3
          ? pick(["draft", "pending"])
          : pick([
              "approved",
              "approved",
              "approved",
              "pending",
              "rejected",
              "returned",
            ]);
      const rid = record(
        "expense",
        rep.id,
        status,
        {
          date,
          category,
          amount,
          distanceKm: category === "TA" ? km : undefined,
          remarks:
            category === "TA"
              ? `Local travel on ${route.name}`
              : category + " claim for the field day",
        },
        ist(date, 19),
      );
      const mgr = manager.get(rep.id)!;
      if (status === "approved")
        decision(rid, mgr, "approve", "", ist(addDays(date, 2), 10));
      if (status === "rejected")
        decision(
          rid,
          mgr,
          "reject",
          "Duplicate of an earlier claim for the same day.",
          ist(addDays(date, 2), 10),
        );
      if (status === "returned")
        decision(
          rid,
          mgr,
          "return",
          "Add the travel distance and resubmit.",
          ist(addDays(date, 2), 10),
        );
    }
  // leave
  for (const rep of reps.slice(0, 11)) {
    const from = addDays(TODAY, int(-20, 18));
    const status =
      from < TODAY
        ? pick(["approved", "approved", "rejected"])
        : pick(["pending", "approved", "draft"]);
    const rid = record(
      "leave",
      rep.id,
      status,
      {
        fromDate: from,
        toDate: addDays(from, int(0, 2)),
        leaveType: pick(["Casual", "Sick", "Annual"]),
        reason: pick([
          "Family function",
          "Fever and rest advised",
          "Annual vacation",
          "Personal work",
        ]),
      },
      ist(addDays(from, -3), 10),
    );
    if (status === "approved")
      decision(
        rid,
        manager.get(rep.id)!,
        "approve",
        "",
        ist(addDays(from, -2), 10),
      );
    if (status === "rejected")
      decision(
        rid,
        manager.get(rep.id)!,
        "reject",
        "Team strength is low that week.",
        ist(addDays(from, -2), 10),
      );
  }
  // tour plans for the coming days
  for (const rep of reps.slice(0, 8))
    for (let n = 1; n <= 6; n++) {
      const date = addDays(TODAY, n);
      if (isSunday(date)) continue;
      const status = pick(["approved", "approved", "pending", "draft"]);
      const rid = record(
        "tourplan",
        rep.id,
        status,
        {
          date,
          routeId: pick(routes.get(rep.hq)!).id,
          workType: "Field work",
          notes: "Planned doctor coverage",
        },
        ist(TODAY, 9),
      );
      if (status === "approved")
        decision(rid, manager.get(rep.id)!, "approve", "", ist(TODAY, 12));
    }
  // sales, RCPA, reminders, sponsorship
  const traders = customers.filter(
    (c) => c.type === "Chemist" || c.type === "Stockist",
  );
  for (let i = 0; i < 140; i++) {
    const c = pick(traders);
    const p = pick(products);
    const quantity = int(20, 240);
    const date = pick(days.filter((d) => d <= TODAY));
    record(
      "sale",
      c.assignedTo,
      "active",
      {
        date,
        saleType: chance(0.7) ? "Secondary" : "Doctor-wise",
        customerId: c.id,
        productId: p.id,
        quantity,
        amount: round2(quantity * p.price * 0.78),
      },
      ist(date, 18),
    );
  }
  for (let i = 0; i < 60; i++) {
    const c = pick(customers.filter((x) => x.type === "Chemist"));
    const date = pick(days);
    record(
      "rcpa",
      c.assignedTo,
      "active",
      {
        date,
        customerId: c.id,
        productId: pick(products).id,
        competitor: pick(COMPETITORS),
        quantity: int(10, 180),
        notes:
          "Competitor shows steady movement; our brand needs better display.",
      },
      ist(date, 17),
    );
  }
  for (let i = 0; i < 45; i++) {
    const c = pick(customers.filter((x) => x.type === "Doctor"));
    const date = addDays(TODAY, int(-6, 10));
    record(
      "reminder",
      c.assignedTo,
      "active",
      {
        date,
        customerId: c.id,
        notes: pick([
          "Share the latest clinical study",
          "Follow up on the trial prescription",
          "Deliver the requested samples",
          "Confirm the CME attendance",
        ]),
        completed: date < TODAY && chance(0.6) ? "Yes" : "No",
      },
      ist(addDays(date, -2), 12),
    );
  }
  for (let i = 0; i < 8; i++) {
    const c = pick(doctors);
    const status = pick(["pending", "pending", "approved", "returned"]);
    const rid = record(
      "sponsorship",
      c.assignedTo,
      status,
      {
        customerId: c.id,
        campaignId: live.id,
        amount: pick([15000, 25000, 40000, 60000]),
        reason: "Support for a regional CME programme on respiratory care.",
      },
      ist(addDays(TODAY, -int(1, 15)), 11),
    );
    if (status === "approved")
      decision(
        rid,
        manager.get(c.assignedTo)!,
        "approve",
        "",
        ist(addDays(TODAY, -1), 10),
      );
    if (status === "returned")
      decision(
        rid,
        manager.get(c.assignedTo)!,
        "return",
        "Attach the event agenda and resubmit.",
        ist(addDays(TODAY, -1), 10),
      );
  }
  // shifts and tracking points for the last three days
  for (const date of days.slice(-3)) {
    for (const rep of reps) {
      const planId = planByRepDay.get(rep.id + date);
      if (!planId) continue;
      const h = hq.get(rep.hq)!;
      const visits = (visitsByRepDay.get(rep.id + date) || []).sort((a, b) =>
        a.at.localeCompare(b.at),
      );
      const startMs = Date.parse(ist(date, 9, 30));
      const endMs = Date.parse(ist(date, 18, 0));
      const isToday = date === TODAY;
      if (isToday && NOW < startMs) continue;
      const open = isToday && NOW < endMs;
      const shiftEnd = open ? null : new Date(endMs).toISOString();
      const lastMs = open ? Math.min(NOW - 60000, endMs) : endMs;
      const shiftId = id();
      add(
        "shifts",
        shiftId,
        TENANT,
        rep.id,
        new Date(startMs).toISOString(),
        shiftEnd,
        "seed-device-" + rep.id,
      );
      const way = [
        {
          t: startMs,
          lat: h.lat + (rnd() - 0.5) * 0.01,
          lng: h.lng + (rnd() - 0.5) * 0.01,
        },
      ];
      for (const v of visits) {
        const t = Date.parse(v.at);
        way.push(
          { t: t - 8 * 60000, lat: v.customer.lat, lng: v.customer.lng },
          { t: t + 18 * 60000, lat: v.customer.lat, lng: v.customer.lng },
        );
      }
      way.push({ t: endMs, lat: h.lat, lng: h.lng });
      for (
        let t = startMs, battery = 100;
        t <= lastMs;
        t += int(240, 360) * 1000, battery = Math.max(12, battery - 1)
      ) {
        let k = 0;
        while (k < way.length - 2 && way[k + 1].t < t) k++;
        const a = way[k],
          b = way[k + 1];
        const f =
          b.t === a.t ? 1 : Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
        const lat = a.lat + (b.lat - a.lat) * f + (rnd() - 0.5) * 0.0004;
        const lng = a.lng + (b.lng - a.lng) * f + (rnd() - 0.5) * 0.0004;
        add(
          "points",
          id(),
          TENANT,
          rep.id,
          shiftId,
          new Date(t).toISOString(),
          new Date(t + int(1, 20) * 1000).toISOString(),
          lat,
          lng,
          int(6, 38),
          battery,
          0,
        );
      }
    }
  }
  // support requests
  const sup = (
    user: string | null,
    kind: string,
    category: string,
    subject: string,
    message: string,
    status: string,
    response: string,
    contact: string,
    daysAgo: number,
  ) =>
    add(
      "support_requests",
      id(),
      TENANT,
      user,
      kind,
      category,
      subject,
      message,
      "",
      contact,
      status,
      response,
      status === "resolved" ? "admin" : null,
      ist(addDays(TODAY, -daysAgo), 11),
      ist(addDays(TODAY, -daysAgo), 12),
    );
  sup(
    "rohit",
    "support",
    "sync",
    "Visit stuck in outbox",
    "One visit from yesterday is not syncing from the Sync center.",
    "open",
    "",
    "rohit@mrconnect.test",
    1,
  );
  sup(
    "sneha",
    "support",
    "location",
    "Location needs review on many calls",
    "My GPS is drifting inside hospital buildings. What should I write as the reason?",
    "in_progress",
    "Please explain the floor and building name in the reason. We are reviewing the radius.",
    "sneha@mrconnect.test",
    3,
  );
  sup(
    "vikram",
    "support",
    "report",
    "Report deadline passed",
    "I could not submit the report for last Monday.",
    "resolved",
    "Report reopened for you. Please submit it today.",
    "vikram@mrconnect.test",
    6,
  );
  sup(
    "deepa",
    "access_reset",
    "access",
    "Access reset requested",
    "Forgot my password after changing my phone.",
    "open",
    "",
    "deepa@mrconnect.test",
    0,
  );
  return hash;
}
// ---- writing -----------------------------------------------------------------
const columns: Record<string, string[]> = {
  tenants: ["id", "code", "name", "policies"],
  users: [
    "id",
    "tenant_id",
    "email",
    "name",
    "role",
    "manager_id",
    "territory_id",
    "password_hash",
    "active",
    "must_change",
    "version",
  ],
  records: [
    "id",
    "tenant_id",
    "kind",
    "owner_id",
    "status",
    "version",
    "data",
    "created_at",
    "updated_at",
    "deleted",
  ],
  decisions: [
    "id",
    "tenant_id",
    "record_id",
    "actor_id",
    "action",
    "reason",
    "created_at",
  ],
  audit: [
    "id",
    "tenant_id",
    "actor_id",
    "action",
    "entity_id",
    "details",
    "created_at",
  ],
  stock_ledger: [
    "id",
    "tenant_id",
    "user_id",
    "item_type",
    "item_id",
    "delta",
    "source_id",
    "created_at",
  ],
  inventory: ["tenant_id", "user_id", "item_type", "item_id", "quantity"],
  shifts: ["id", "tenant_id", "user_id", "started_at", "ended_at", "device_id"],
  points: [
    "id",
    "tenant_id",
    "user_id",
    "shift_id",
    "observed_at",
    "received_at",
    "latitude",
    "longitude",
    "accuracy",
    "battery",
    "mocked",
  ],
  support_requests: [
    "id",
    "tenant_id",
    "user_id",
    "kind",
    "category",
    "subject",
    "message",
    "reference",
    "contact",
    "status",
    "response",
    "resolved_by",
    "created_at",
    "updated_at",
  ],
};
// Insert order respects foreign keys.
const writeOrder = [
  "tenants",
  "users",
  "records",
  "decisions",
  "audit",
  "stock_ledger",
  "inventory",
  "shifts",
  "points",
  "support_requests",
];
async function main() {
  const store = await Store.open(
    process.env.DATABASE_URL ||
      process.env.DATABASE_PATH ||
      ".data/mr-connect.sqlite",
  );
  try {
    if (process.argv.includes("--reset")) {
      for (const table of [...tableOrder].reverse())
        await store.run(`DELETE FROM ${table}`);
      console.log("Existing application data removed (--reset).");
    }
    if (await store.get("SELECT id FROM tenants LIMIT 1"))
      throw new Error(
        "The database already has a company. Seed only an empty database, or pass --reset to empty it first.",
      );
    const started = Date.now();
    await build();
    await store.transaction(async () => {
      for (const table of writeOrder) {
        const rows = out[table] || [];
        const cols = columns[table];
        for (const [r, row] of rows.entries())
          for (const [c, value] of row.entries())
            if (
              value === undefined ||
              (typeof value === "number" && !Number.isFinite(value)) ||
              (typeof value === "object" && value !== null)
            )
              throw new Error(
                `Bad value in ${table} row ${r} column ${cols[c]}: ${String(value)}`,
              );
        const per = Math.max(1, Math.min(400, Math.floor(30000 / cols.length)));
        for (let i = 0; i < rows.length; i += per) {
          const part = rows.slice(i, i + per);
          await store.run(
            `INSERT INTO ${table}(${cols.join(",")}) VALUES ${part.map(() => "(" + cols.map(() => "?").join(",") + ")").join(",")}`,
            ...part.flat(),
          );
        }
      }
    });
    const counts = Object.fromEntries(
      writeOrder.map((t) => [t, (out[t] || []).length]),
    );
    console.log(
      "Seeded in",
      Math.round((Date.now() - started) / 100) / 10,
      "s:",
      counts,
    );
    console.log(`Company code VIDYA · password for every user: ${password}`);
    console.log(
      "Admin admin@mrconnect.test · managers manager@/kavita@mrconnect.test · reps aman@, priya@, rohit@ …",
    );
  } finally {
    await store.close();
  }
}
await main();
