import { moduleByKey, type Role } from "../../../packages/shared/src/index.ts";

export type NavItem = {
  to: string;
  icon: string;
  label: string;
  /** Shown only when this module is readable by the signed-in user. */
  module?: string;
  /** Hidden from these roles. */
  hideFor?: Role[];
};
export type NavGroup = {
  id: string;
  label: string;
  /** Collapsed until the user opens it (or visits one of its pages). */
  collapsed?: boolean;
  items: NavItem[];
};

/** Task-oriented sidebar: what to do today, then plans, people, money, insight. */
export const navGroups: NavGroup[] = [
  {
    id: "today",
    label: "Today",
    items: [
      { to: "/", icon: "house", label: "Overview" },
      {
        to: "/approvals",
        icon: "shield-check",
        label: "Approvals",
        hideFor: ["rep"],
      },
      { to: "/tracking", icon: "map-pin", label: "Calls & tracking" },
      { to: "/activity", icon: "file-text", label: "Calls & daily reports" },
    ],
  },
  {
    id: "plan",
    label: "Planning",
    items: [
      {
        to: "/module/tourplan",
        icon: "clipboard-list",
        label: "Tour plans",
        module: "tourplan",
      },
      { to: "/tour-calendar", icon: "calendar-days", label: "Tour calendar" },
      {
        to: "/module/dayplan",
        icon: "sun",
        label: "Day plans",
        module: "dayplan",
      },
      {
        to: "/module/target",
        icon: "target",
        label: "Targets",
        module: "target",
      },
      {
        to: "/module/campaign",
        icon: "megaphone",
        label: "Campaigns",
        module: "campaign",
      },
      {
        to: "/module/leave",
        icon: "plane",
        label: "Leave",
        module: "leave",
      },
    ],
  },
  {
    id: "people",
    label: "People & masters",
    items: [
      { to: "/team", icon: "users", label: "Field team", hideFor: ["rep"] },
      { to: "/customers", icon: "stethoscope", label: "Customers" },
      {
        to: "/module/route",
        icon: "route",
        label: "Routes & territories",
        module: "route",
      },
    ],
  },
  {
    id: "money",
    label: "Money & stock",
    items: [
      {
        to: "/module/expense",
        icon: "receipt",
        label: "Expenses",
        module: "expense",
      },
      { to: "/allowance", icon: "calculator", label: "TA/DA calculator" },
      { to: "/pob", icon: "shopping-cart", label: "POB & sales" },
      {
        to: "/module/stockstatement",
        icon: "file-spreadsheet",
        label: "Stock statements",
        module: "stockstatement",
      },
      { to: "/inventory", icon: "package", label: "Samples & inputs" },
      {
        to: "/module/sponsorship",
        icon: "gift",
        label: "Sponsorship",
        module: "sponsorship",
      },
    ],
  },
  {
    id: "field",
    label: "Field records",
    collapsed: true,
    items: [
      {
        to: "/module/rcpa",
        icon: "clipboard-check",
        label: "RCPA",
        module: "rcpa",
      },
      {
        to: "/module/reminder",
        icon: "bell",
        label: "Reminders",
        module: "reminder",
      },
      {
        to: "/module/announcement",
        icon: "message-square",
        label: "Head-office updates",
        module: "announcement",
      },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    items: [
      {
        to: "/reports",
        icon: "chart-no-axes-combined",
        label: "Reports",
      },
    ],
  },
];
export const settingsItem: NavItem = {
  to: "/settings",
  icon: "settings",
  label: "Settings",
};

export const matches = (item: NavItem, pathname: string) =>
  item.to === "/"
    ? pathname === "/"
    : pathname === item.to || pathname.startsWith(item.to + "/");

/** Section and page names for the breadcrumb. */
export function locate(pathname: string): { group: string; page: string } {
  for (const g of navGroups)
    for (const i of g.items)
      if (matches(i, pathname)) return { group: g.label, page: i.label };
  if (matches(settingsItem, pathname))
    return { group: "Workspace", page: settingsItem.label };
  if (pathname.startsWith("/pob") || pathname.startsWith("/exports"))
    return { group: "Money & stock", page: "POB & sales" };
  if (pathname.startsWith("/exceptions") || pathname.startsWith("/calls"))
    return { group: "Today", page: "Calls & tracking" };
  const mod = pathname.match(/^\/module\/([^/]+)/);
  if (mod && moduleByKey[mod[1]])
    return {
      group: moduleByKey[mod[1]].group,
      page: moduleByKey[mod[1]].title,
    };
  return { group: "Workspace", page: "Page" };
}

/** "routeId" → "Route", "doctorCalls" → "Doctor calls". */
export function humanize(key: string): string {
  const words = key
    .replace(/Id$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
