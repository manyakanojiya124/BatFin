import { AlertCircle, ArrowRight, KeyRound, LogOut } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import {
  changeAdminPassword,
  logoutAdmin,
} from "../../services/api";
import { useAdminStore } from "../../store/admin.store";

function validatePassword(password: string) {
  if (password.length < 14) return "Use at least 14 characters.";
  if (!/[a-z]/.test(password)) return "Add a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Add an uppercase letter.";
  if (!/\d/.test(password)) return "Add a number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Add a symbol.";
  return null;
}

export function AdminPasswordChangePage() {
  const navigate = useNavigate();
  const admin = useAdminStore((state) => state.admin);
  const csrfToken = useAdminStore((state) => state.csrfToken);
  const setAdmin = useAdminStore((state) => state.setAdmin);
  const clearSession = useAdminStore((state) => state.clearSession);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!csrfToken) {
      setError("The secure session token is missing. Sign in again.");
      return;
    }
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password confirmation does not match.");
      return;
    }

    setLoading(true);
    try {
      const result = await changeAdminPassword(
        csrfToken,
        currentPassword,
        newPassword,
      );
      setAdmin(result.admin);
      navigate("/", { replace: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to change the password",
      );
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    if (csrfToken) await logoutAdmin(csrfToken).catch(() => undefined);
    clearSession();
    navigate("/login", { replace: true });
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4 sm:p-6">
      <section className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-card sm:p-8">
        <img alt="BatFIN" className="w-36" src="/LOGO.png" />
        <div className="mt-8 grid size-12 place-items-center rounded-2xl bg-green-50 text-primary">
          <KeyRound className="size-6" />
        </div>
        <p className="mt-5 text-sm font-semibold uppercase tracking-wider text-primary">
          Required security action
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold text-text-primary">
          Change bootstrap password
        </h1>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          {admin?.name}, replace the temporary bootstrap password before accessing any operational admin module.
        </p>

        {error ? (
          <div className="mt-5 flex gap-3 rounded-xl bg-red-50 p-3 text-sm text-error" role="alert">
            <AlertCircle className="size-5 shrink-0" />
            {error}
          </div>
        ) : null}

        <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
          <PasswordField
            autoComplete="current-password"
            label="Current bootstrap password"
            onChange={setCurrentPassword}
            value={currentPassword}
          />
          <PasswordField
            autoComplete="new-password"
            label="New password"
            onChange={setNewPassword}
            value={newPassword}
          />
          <PasswordField
            autoComplete="new-password"
            label="Confirm new password"
            onChange={setConfirmPassword}
            value={confirmPassword}
          />
          <div className="rounded-xl bg-background p-4 text-xs leading-5 text-text-secondary">
            Use 14–128 characters with uppercase, lowercase, number, and symbol. Other active sessions will be revoked.
          </div>
          <button
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-container disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? (
              <span className="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <>
                Set secure password <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </form>

        <button
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-text-secondary hover:bg-background"
          onClick={() => void signOut()}
          type="button"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </section>
    </main>
  );
}

function PasswordField({
  autoComplete,
  label,
  onChange,
  value,
}: {
  autoComplete: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block text-sm font-medium text-text-primary">
      {label}
      <input
        autoComplete={autoComplete}
        className="mt-2 min-h-12 w-full rounded-xl border border-outline px-4 py-3 outline-none transition focus:border-primary focus:ring-4 focus:ring-green-100"
        onChange={(event) => onChange(event.target.value)}
        required
        type="password"
        value={value}
      />
    </label>
  );
}
