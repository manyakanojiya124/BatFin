import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  KeyRound,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AdminModal } from "../../components/AdminModal";
import {
  AdminApiError,
  getManagedAdminSummary,
  inviteManagedAdmin,
  listManagedAdmins,
  verifyAdminStepUp,
} from "../../services/api";
import { useAdminStore } from "../../store/admin.store";
import type { AdminRole } from "../../types/admin";
import type { CustomerPagination } from "../../types/customer";
import type {
  AdminAccountStatus,
  AdminSummary,
  ManagedAdmin,
} from "../../types/governance";

const roles: Array<[AdminRole, string]> = [
  ["SUPPORT_AGENT", "Support Agent"],
  ["OPERATIONS_MANAGER", "Operations Manager"],
  ["FINANCE_MANAGER", "Finance Manager"],
  ["AUDITOR", "Auditor"],
  ["SUPER_ADMIN", "Super Admin"],
];
const statusStyle: Record<AdminAccountStatus, string> = {
  active: "bg-green-50 text-primary",
  invited: "bg-blue-50 text-secondary",
  suspended: "bg-amber-50 text-warning",
  disabled: "bg-red-50 text-error",
};
function roleLabel(role: AdminRole) {
  return roles.find(([value]) => value === role)?.[1] ?? role;
}
function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Never";
}

export function AdminUsersPage() {
  const navigate = useNavigate();
  const currentAdmin = useAdminStore((state) => state.admin);
  const csrfToken = useAdminStore((state) => state.csrfToken);
  const clearSession = useAdminStore((state) => state.clearSession);
  const [admins, setAdmins] = useState<ManagedAdmin[]>([]);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [pagination, setPagination] = useState<CustomerPagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [credential, setCredential] = useState<{ name: string; email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, stats] = await Promise.all([
        listManagedAdmins({ q: query, role: role as AdminRole | "", status: status as AdminAccountStatus | "", page, pageSize: 20 }),
        getManagedAdminSummary(),
      ]);
      setAdmins(list.admins);
      setPagination(list.pagination);
      setSummary(stats.summary);
    } catch (requestError) {
      if (requestError instanceof AdminApiError && requestError.status === 401) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }
      setError(requestError instanceof Error ? requestError.message : "Unable to load administrators");
    } finally {
      setLoading(false);
    }
  }, [clearSession, navigate, page, query, role, status]);

  useEffect(() => { void load(); }, [load]);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQuery(searchInput.trim());
  }
  const canManage = currentAdmin?.role === "SUPER_ADMIN";
  const cards = summary
    ? [
        ["Administrators", summary.total, Users, "bg-blue-50 text-secondary"],
        ["Active", summary.active, UserCheck, "bg-green-50 text-primary"],
        ["Invited", summary.invited, KeyRound, "bg-purple-50 text-purple-700"],
        ["Suspended / disabled", summary.suspended + summary.disabled, UserMinus, "bg-amber-50 text-warning"],
        ["Active sessions", summary.activeSessions, ShieldCheck, "bg-teal-50 text-teal-700"],
        ["Temporarily locked", summary.lockedAccounts, LockKeyhole, "bg-red-50 text-error"],
      ] as const
    : [];

  return (
    <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-sm text-text-secondary">Privileged identity governance</p><h1 className="mt-1 font-heading text-3xl font-semibold">Administrators</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">Invite role-scoped administrators, review security posture, and manage access without exposing credential material.</p></div>
          {canManage ? <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white" onClick={() => setInviteOpen(true)} type="button"><Plus className="size-4" /> Invite administrator</button> : null}
        </div>
        <section className="mt-7 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {cards.map(([label, value, Icon, tone]) => <article className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card" key={label}><span className={`grid size-10 place-items-center rounded-xl ${tone}`}><Icon className="size-5" /></span><p className="mt-3 text-xs text-text-secondary">{label}</p><p className="mt-1 font-heading text-2xl font-semibold">{value}</p></article>)}
        </section>
        {notice ? <div className="mt-5 flex gap-3 rounded-xl bg-green-50 p-4 text-sm text-primary" role="status"><CheckCircle2 className="size-5" />{notice}</div> : null}
        {error ? <div className="mt-5 flex gap-3 rounded-xl bg-red-50 p-4 text-sm text-error" role="alert"><AlertTriangle className="size-5" />{error}</div> : null}

        <section className="mt-6 rounded-2xl border border-outline/70 bg-white p-4 shadow-card">
          <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_190px_auto]" onSubmit={search}>
            <label className="relative"><span className="sr-only">Search administrators</span><Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-text-secondary" /><input className="min-h-12 w-full rounded-xl border border-outline py-3 pl-12 pr-3" onChange={(event) => setSearchInput(event.target.value)} placeholder="Name, email or admin ID" value={searchInput} /></label>
            <select aria-label="Role filter" className="min-h-12 rounded-xl border border-outline bg-white px-3" onChange={(event) => { setRole(event.target.value); setPage(1); }} value={role}><option value="">All roles</option>{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select aria-label="Status filter" className="min-h-12 rounded-xl border border-outline bg-white px-3" onChange={(event) => { setStatus(event.target.value); setPage(1); }} value={status}><option value="">All statuses</option>{["active", "invited", "suspended", "disabled"].map((value) => <option key={value} value={value}>{value}</option>)}</select>
            <button className="min-h-12 rounded-xl bg-primary px-5 text-sm font-semibold text-white" type="submit">Search</button>
          </form>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-outline/70 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-outline/70 px-5 py-4"><div><h2 className="font-heading text-xl font-semibold">Admin directory</h2><p className="mt-1 text-xs text-text-secondary">{pagination.total} privileged identities</p></div><Users className="size-5 text-primary" /></div>
          {loading ? <div className="grid min-h-64 place-items-center"><RefreshCw className="size-7 animate-spin text-primary" /></div> : admins.length ? <div className="divide-y divide-outline/60">{admins.map((admin) => <Link className="grid gap-4 p-4 transition hover:bg-background/70 sm:p-5 md:grid-cols-[minmax(0,1fr)_180px_130px_120px] md:items-center" key={admin.id} to={`/admins/${admin.id}`}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold">{admin.name}</p>{admin.id === currentAdmin?.id ? <span className="rounded-full bg-forest px-2 py-0.5 text-[9px] font-semibold text-white">YOU</span> : null}</div><p className="mt-1 truncate text-sm text-text-secondary">{admin.email}</p><p className="mt-1 text-xs text-text-secondary">Last login: {date(admin.lastLoginAt)}</p></div><div><p className="text-sm font-medium">{roleLabel(admin.role)}</p><p className="mt-1 text-xs text-text-secondary">{admin.permissions.length} permissions</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusStyle[admin.status]}`}>{admin.status}</span><div className="text-sm text-text-secondary"><p>{admin.activeSessionCount ?? 0} sessions</p><p className="mt-1 text-xs">{admin.unusedBackupCodeCount ?? 0} backup codes</p></div></Link>)}</div> : <div className="px-6 py-16 text-center"><Users className="mx-auto size-10 text-text-secondary" /><h3 className="mt-4 font-heading text-xl font-semibold">No administrators found</h3></div>}
          <div className="flex items-center justify-between border-t border-outline/70 px-4 py-4 sm:px-5"><button className="page-btn" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button"><ChevronLeft className="size-4" />Previous</button><span className="text-xs text-text-secondary">Page {pagination.page} of {pagination.totalPages}</span><button className="page-btn" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((current) => current + 1)} type="button">Next<ChevronRight className="size-4" /></button></div>
        </section>
      </div>
      {inviteOpen ? <InviteModal csrfToken={csrfToken} onClose={() => setInviteOpen(false)} onCreated={async (result) => { setInviteOpen(false); setCredential(result); setNotice("Administrator invitation created and audited."); await load(); }} /> : null}
      {credential ? <CredentialModal credential={credential} onClose={() => setCredential(null)} /> : null}
    </main>
  );
}

function InviteModal({ csrfToken, onClose, onCreated }: { csrfToken: string | null; onClose: () => void; onCreated: (credential: { name: string; email: string; password: string }) => Promise<void> }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [role, setRole] = useState<AdminRole>("SUPPORT_AGENT"); const [reason, setReason] = useState(""); const [code, setCode] = useState(""); const [working, setWorking] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!csrfToken) return; setWorking(true); setError(""); try { await verifyAdminStepUp(csrfToken, code); const result = await inviteManagedAdmin(csrfToken, { name, email, role, reason }); await onCreated({ name: result.admin.name, email: result.admin.email, password: result.temporaryPassword }); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to invite administrator"); } finally { setWorking(false); } }
  return <AdminModal description="The temporary password is returned once and never written to audit metadata. The invited administrator must enroll TOTP and change this password." onClose={() => !working && onClose()} title="Invite administrator"><form className="space-y-4" onSubmit={submit}>{error ? <ErrorAlert text={error} /> : null}<Input label="Full name" onChange={setName} value={name} /><Input label="Work email" onChange={setEmail} type="email" value={email} /><label className="block text-sm font-medium">Role<select className="mt-2 min-h-12 w-full rounded-xl border border-outline bg-white px-3" onChange={(event) => setRole(event.target.value as AdminRole)} value={role}>{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><Area label="Private audit reason" onChange={setReason} value={reason} /><Input label="Authenticator code" maxLength={6} onChange={(value) => setCode(value.replace(/\D/g, ""))} value={code} /><button className="min-h-12 w-full rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-60" disabled={working} type="submit">{working ? "Verifying and creating…" : "Create secure invitation"}</button></form></AdminModal>;
}

function CredentialModal({ credential, onClose }: { credential: { name: string; email: string; password: string }; onClose: () => void }) {
  const content = `BatFIN administrator invitation\nName: ${credential.name}\nEmail: ${credential.email}\nTemporary password: ${credential.password}\nThis password must be changed after TOTP enrollment.`;
  function download() { const url = URL.createObjectURL(new Blob([content], { type: "text/plain" })); const link = document.createElement("a"); link.href = url; link.download = "batfin-admin-invitation.txt"; link.click(); URL.revokeObjectURL(url); }
  return <AdminModal description="Copy this temporary credential now. It cannot be retrieved after this dialog is closed." onClose={onClose} title="One-time invitation credential"><div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Deliver through an approved out-of-band channel. BatFIN does not simulate invitation email delivery.</div><dl className="mt-5 space-y-4 rounded-xl bg-background p-4"><div><dt className="text-xs text-text-secondary">Administrator</dt><dd className="mt-1 font-semibold">{credential.name} · {credential.email}</dd></div><div><dt className="text-xs text-text-secondary">Temporary password</dt><dd className="mt-2 break-all rounded-lg bg-white p-3 font-mono font-semibold">{credential.password}</dd></div></dl><div className="mt-5 grid gap-3 sm:grid-cols-2"><button className="action-btn justify-center" onClick={() => void navigator.clipboard.writeText(content)} type="button"><Copy className="size-4" />Copy details</button><button className="action-btn justify-center" onClick={download} type="button"><Download className="size-4" />Download once</button></div><button className="mt-3 min-h-12 w-full rounded-xl bg-primary text-sm font-semibold text-white" onClick={onClose} type="button">I stored the credential securely</button></AdminModal>;
}

function Input({ label, maxLength, onChange, type = "text", value }: { label: string; maxLength?: number; onChange: (value: string) => void; type?: string; value: string }) { return <label className="block text-sm font-medium">{label}<input className="mt-2 min-h-12 w-full rounded-xl border border-outline px-3" maxLength={maxLength} onChange={(event) => onChange(event.target.value)} required type={type} value={value} /></label>; }
function Area({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) { return <label className="block text-sm font-medium">{label}<textarea className="mt-2 min-h-24 w-full rounded-xl border border-outline p-3" maxLength={500} minLength={10} onChange={(event) => onChange(event.target.value)} required value={value} /></label>; }
function ErrorAlert({ text }: { text: string }) { return <div className="flex gap-3 rounded-xl bg-red-50 p-3 text-sm text-error"><AlertTriangle className="size-5 shrink-0" />{text}</div>; }
