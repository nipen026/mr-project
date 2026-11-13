import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from "react-router-dom";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "./styles.css";
import { api, json } from "./api";
import { WorkspaceContext, type Workspace } from "./context";
import { AppSkeleton, Button, Icon, Notice } from "./ui";
import {
  Activity,
  Approvals,
  Inventory,
  Overview,
  RecordsPage,
  Reports,
  Team,
} from "./pages";
import { AllowanceCalculator, TourCalendar } from "./planning";
import { locate, matches, navGroups, settingsItem, type NavItem } from "./nav";
import {
  EmployeeProfile,
  Evidence,
  Exceptions,
  ExportCenter,
  OrderDetail,
  OrdersPage,
} from "./insights";
import { TrackingPage } from "./TrackingPage";
import { Account, Settings } from "./Settings";
import type { User } from "../../../packages/shared/src/index.ts";
import { TextField } from "./controls";
function App() {
  const [user, setUser] = useState<User | null>();
  useEffect(() => {
    api("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
    const expired = () => setUser(null);
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  if (user === undefined) return <AppSkeleton />;
  if (!user) return <Login onSuccess={setUser} />;
  if (user.mustChangePassword)
    return (
      <div className="access-page">
        <Notice>
          Change your temporary password to unlock your workspace.
        </Notice>
        <Account />
      </div>
    );
  return <WorkspaceApp user={user} logout={() => setUser(null)} />;
}
function Login({ onSuccess }: { onSuccess: (u: User) => void }) {
  const [code, setCode] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [help, setHelp] = useState(false);
  return (
    <div className="login-page">
      <div className="login-story">
        <Link className="brand" to="/">
          <Icon name="briefcase-medical" size={30} />
          MR Connect
        </Link>
        <div>
          <span className="eyebrow lime">CONNECTED FIELD OPERATIONS</span>
          <h1>
            Every visit.
            <br />A stronger
            <br />
            connection.
          </h1>
          <p>
            A clear view of your field force.
            <br />A focused workspace for every representative.
          </p>
          <div className="story-points">
            <span>01 · Plan with purpose</span>
            <span>02 · Capture the complete visit</span>
            <span>03 · Decide with confidence</span>
          </div>
        </div>
        <small>Mobile field app + administration workspace</small>
      </div>
      <main className="login-form">
        <div className="login-box">
          <span className="eyebrow">YOUR COMPANY WORKSPACE</span>
          <h1>{help ? "Account & access assistance" : "Welcome back"}</h1>
          <p className="muted">
            {help
              ? "Your company administrator manages employee access."
              : "Sign in to manage a more connected field team."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              try {
                if (help) {
                  const r = await api(
                    "/auth/access-help",
                    json("POST", { companyCode: code, email }),
                  );
                  setError(r.message);
                } else {
                  const r = await api(
                    "/auth/login",
                    json("POST", {
                      companyCode: code,
                      email,
                      password,
                      client: "web",
                    }),
                  );
                  onSuccess(r.user);
                }
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <TextField
              label="Company code"
              id="company-code"
              required
              autoComplete="organization"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Your company code"
            />
            <TextField
              label="Employee ID / email"
              id="user-email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
            {!help && (
              <TextField
                label="Password"
                id="user-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
            {error && <Notice tone={help ? "info" : "error"}>{error}</Notice>}
            <Button disabled={busy} className="full-width">
              {busy
                ? "Please wait…"
                : help
                  ? "Get access instructions"
                  : "Sign in"}
            </Button>
          </form>
          <button
            className="text-button access-link"
            onClick={() => {
              setHelp(!help);
              setError("");
            }}
          >
            {help ? "Back to sign-in" : "Forgot password or need access?"}
          </button>
          <p className="login-foot">
            Company-issued device? Your administrator will provide your account
            and deployment instructions.
          </p>
        </div>
      </main>
    </div>
  );
}
const initials = (name: string) =>
  name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
function Sidebar({
  workspace,
  user,
  open,
  close,
  pending,
  logout,
}: {
  workspace: Workspace;
  user: User;
  open: boolean;
  close: () => void;
  pending: number;
  logout: () => void;
}) {
  const here = useLocation().pathname;
  const allowed = (i: NavItem) =>
    !i.hideFor?.includes(user.role) &&
    (!i.module || workspace.modules.some((m) => m.key === i.module));
  const groups = navGroups
    .map((g) => ({ ...g, items: g.items.filter(allowed) }))
    .filter((g) => g.items.length);
  const [closed, setClosed] = useState<Record<string, boolean>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("mr-nav-closed") || "null");
      if (saved) return saved;
    } catch {
      /* storage can be unavailable; fall back to defaults */
    }
    return Object.fromEntries(navGroups.map((g) => [g.id, !!g.collapsed]));
  });
  const toggle = (id: string) =>
    setClosed((c) => {
      const next = { ...c, [id]: !c[id] };
      try {
        localStorage.setItem("mr-nav-closed", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  const link = (i: NavItem) => (
    <NavLink
      end={i.to === "/"}
      key={i.to}
      to={i.to}
      className={matches(i, here) ? "active" : ""}
      onClick={close}
    >
      <Icon name={i.icon} size={20} />
      {i.label}
      {i.to === "/approvals" && pending > 0 && (
        <span className="nav-count" aria-hidden="true">
          {pending}
        </span>
      )}
    </NavLink>
  );
  return (
    <aside className={open ? "sidebar open" : "sidebar"}>
      <Link className="brand" to="/" onClick={close}>
        <Icon name="briefcase-medical" size={28} />
        MR Connect
      </Link>
      <nav aria-label="Main navigation">
        {groups.map((g) => {
          const active = g.items.some((i) => matches(i, here));
          const shut = closed[g.id] && !active;
          return (
            <div className="nav-group" key={g.id}>
              <button
                type="button"
                className="nav-heading"
                aria-expanded={!shut}
                onClick={() => toggle(g.id)}
              >
                {g.label}
                <span
                  className={shut ? "caret shut" : "caret"}
                  aria-hidden="true"
                >
                  <Icon name="chevron-down" size={16} />
                </span>
              </button>
              {!shut && g.items.map(link)}
            </div>
          );
        })}
      </nav>
      <div className="nav-footer">
        <nav aria-label="Workspace">{link(settingsItem)}</nav>
        <div className="workspace-note">
          <span className="avatar" aria-hidden="true">
            {initials(user.name)}
          </span>
          <span>
            <strong>{user.name}</strong>
            <small>
              {user.role === "rep" ? "Representative" : user.role} ·{" "}
              {workspace.company.code}
            </small>
          </span>
        </div>
        <button className="logout" onClick={logout}>
          <Icon name="log-out" size={22} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
function WorkspaceApp({ user, logout }: { user: User; logout: () => void }) {
  const route = useLocation();
  const [workspace, setWorkspace] = useState<Workspace>(),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [toast, setToast] = useState(""),
    [search, setSearch] = useState(""),
    [menu, setMenu] = useState(false),
    [pending, setPending] = useState(0);
  const navigate = useNavigate();
  const where = locate(route.pathname);
  const refresh = useCallback(async () => {
    const r = await api<Workspace>("/bootstrap");
    setWorkspace(r);
    setVersion((v) => v + 1);
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (user.role === "rep") return;
    api<{ items: unknown[] }>("/approvals")
      .then((r) => setPending(r.items.length))
      .catch(() => setPending(0));
  }, [version, user.role]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  if (error)
    return (
      <div className="access-page">
        <Notice tone="error">{error}</Notice>
        <Button onClick={() => location.reload()}>Retry</Button>
      </div>
    );
  if (!workspace) return <AppSkeleton />;
  return (
    <WorkspaceContext.Provider
      value={{ workspace, refresh, notify: setToast, version }}
    >
      <div className="app-shell">
        <Sidebar
          workspace={workspace}
          user={user}
          open={menu}
          close={() => setMenu(false)}
          pending={pending}
          logout={async () => {
            await api("/auth/logout", json("POST", {}));
            logout();
          }}
        />
        <div className="main-shell">
          <header className="topbar">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMenu(!menu)}
              aria-label="Toggle navigation"
            >
              ☰
            </button>
            <nav className="company-title" aria-label="Breadcrumb">
              <span>{workspace.company.code}</span>
              <span aria-hidden="true">›</span>
              <span>{where.group}</span>
              <span aria-hidden="true">›</span>
              <strong>{where.page}</strong>
            </nav>
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                navigate("/customers?q=" + encodeURIComponent(search));
              }}
            >
              <Icon name="search" size={22} />
              <input
                aria-label="Search customers"
                placeholder="Search customers…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </form>
            <Link
              className="icon-button"
              aria-label="Head-office updates"
              to="/module/announcement"
            >
              <Icon name="bell" />
            </Link>
            <Link
              className="avatar"
              aria-label="Account settings"
              to="/settings?tab=account"
            >
              {initials(user.name)}
            </Link>
          </header>
          <main className="content">
            {workspace.company.name.includes("Demo") && (
              <div className="demo-banner">
                DEMO WORKSPACE · Fictional records for testing
              </div>
            )}
            <div key={route.pathname} className="page-enter">
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/team" element={<Team />} />
                <Route path="/team/:id" element={<EmployeeProfile />} />
                <Route path="/pob" element={<OrdersPage />} />
                <Route path="/pob/:id" element={<OrderDetail />} />
                <Route path="/exceptions" element={<Exceptions />} />
                <Route path="/calls/:id" element={<Evidence />} />
                <Route path="/exports" element={<ExportCenter />} />
                <Route
                  path="/customers"
                  element={<RecordsPage key="customer" kind="customer" />}
                />
                {workspace.modules.map((m) => (
                  <Route
                    key={m.key}
                    path={"/module/" + m.key}
                    element={<RecordsPage key={m.key} kind={m.key} />}
                  />
                ))}
                <Route path="/tour-calendar" element={<TourCalendar />} />
                <Route path="/allowance" element={<AllowanceCalculator />} />
                <Route path="/approvals" element={<Approvals />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/tracking" element={<TrackingPage />} />
                <Route path="/activity" element={<Activity />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>
        </div>
        {toast && (
          <div className="toast" role="status">
            ✓ {toast}
          </div>
        )}
      </div>
    </WorkspaceContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
