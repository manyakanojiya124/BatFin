import {
  Boxes,
  BrainCircuit,
  CreditCard,
  Database,
  FileClock,
  Headset,
  LayoutDashboard,
  Laptop,
  LogOut,
  Settings,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { logoutAdmin } from "../services/api";
import { useAdminStore } from "../store/admin.store";
import type { AdminRole } from "../types/admin";

const roleLabels = {
  SUPPORT_AGENT: "Support Agent",
  OPERATIONS_MANAGER: "Operations Manager",
  FINANCE_MANAGER: "Finance Manager",
  AUDITOR: "Auditor",
  SUPER_ADMIN: "Super Admin",
} as const;

const operationalRoles: readonly AdminRole[] = [
  "SUPPORT_AGENT",
  "OPERATIONS_MANAGER",
  "AUDITOR",
  "SUPER_ADMIN",
];
const financeRoles: readonly AdminRole[] = [
  "FINANCE_MANAGER",
  "AUDITOR",
  "SUPER_ADMIN",
];
const governanceReadRoles: readonly AdminRole[] = ["AUDITOR", "SUPER_ADMIN"];
const superAdminRoles: readonly AdminRole[] = ["SUPER_ADMIN"];

const activeNav: Array<{
  label: string;
  to: string;
  icon: LucideIcon;
  end: boolean;
  roles?: readonly AdminRole[];
}> = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard, end: true },
  { label: "Customers", to: "/customers", icon: Users, end: false },
  { label: "Inventory & QR", to: "/inventory", icon: Boxes, end: false, roles: operationalRoles },
  { label: "Support Tickets", to: "/tickets", icon: Headset, end: false, roles: operationalRoles },
  { label: "Payments", to: "/payments", icon: CreditCard, end: false, roles: financeRoles },
  { label: "Audit Logs", to: "/audit", icon: FileClock, end: false, roles: governanceReadRoles },
  { label: "Administrators", to: "/admins", icon: UserCog, end: false, roles: governanceReadRoles },
  { label: "Admin Sessions", to: "/sessions", icon: Laptop, end: false, roles: governanceReadRoles },
  { label: "AI Analytics", to: "/analytics", icon: BrainCircuit, end: false, roles: superAdminRoles },
  { label: "Business Data", to: "/data", icon: Database, end: false, roles: superAdminRoles },
  { label: "Settings", to: "/settings", icon: Settings, end: false, roles: superAdminRoles },
];

function navClass(active: boolean) {
  return `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${
    active
      ? "bg-green-50 text-primary"
      : "text-text-secondary hover:bg-background hover:text-text-primary"
  }`;
}

export function AdminLayout() {
  const navigate = useNavigate();
  const admin = useAdminStore((state) => state.admin);
  const csrfToken = useAdminStore((state) => state.csrfToken);
  const clearSession = useAdminStore((state) => state.clearSession);
  const visibleNav = activeNav.filter(
    (item) => !item.roles || (admin ? item.roles.includes(admin.role) : false),
  );

  async function signOut() {
    if (csrfToken) await logoutAdmin(csrfToken).catch(() => undefined);
    clearSession();
    navigate("/login", { replace: true });
  }

  return (
    <>
      <a className="fixed left-4 top-3 z-[60] -translate-y-20 rounded-xl bg-forest px-4 py-3 text-sm font-semibold text-white shadow-lg transition focus:translate-y-0" href="#admin-main">
        Skip to admin content
      </a>
      <div className="min-h-screen bg-background lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden min-h-screen border-r border-outline/70 bg-white p-5 lg:flex lg:flex-col">
        <img alt="BatFIN" className="w-36" src="/LOGO.png" />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">
          Administration
        </p>

        <nav className="mt-8 space-y-1" aria-label="Admin navigation">
          {visibleNav.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              className={({ isActive }) => navClass(isActive)}
              end={end}
              key={to}
              to={to}
            >
              <Icon className="size-5" /> {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto rounded-2xl bg-forest p-4 text-white">
          <p className="truncate text-sm font-semibold">{admin?.name}</p>
          <p className="mt-1 text-xs text-white/60">
            {admin ? roleLabels[admin.role] : ""}
          </p>
          <button
            className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/20 text-xs font-semibold hover:bg-white/10"
            onClick={() => void signOut()}
            type="button"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 border-b border-outline/70 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6">
            <img alt="BatFIN" className="w-28" src="/LOGO.png" />
            <button
              className="grid size-10 place-items-center rounded-full border border-outline text-text-secondary"
              onClick={() => void signOut()}
              type="button"
            >
              <LogOut className="size-5" />
            </button>
          </div>
          <nav className="flex gap-2 overflow-x-auto px-4 pb-3 sm:px-6" aria-label="Admin navigation">
            {visibleNav.map(({ label, to, icon: Icon, end }) => (
              <NavLink
                className={({ isActive }) =>
                  `inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold ${
                    isActive
                      ? "bg-green-50 text-primary"
                      : "text-text-secondary"
                  }`
                }
                end={end}
                key={to}
                to={to}
              >
                <Icon className="size-4" /> {label}
              </NavLink>
            ))}
          </nav>
        </header>
        <div id="admin-main" tabIndex={-1}>
          <Outlet />
        </div>
      </div>
      </div>
    </>
  );
}
