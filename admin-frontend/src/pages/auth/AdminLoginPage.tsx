import {
  AlertCircle,
  ArrowRight,
  Check,
  Clipboard,
  Download,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "react-router-dom";

import {
  beginAdminLogin,
  verifyAdminMfa,
} from "../../services/api";
import { useAdminStore } from "../../store/admin.store";
import type { AdminLoginChallenge } from "../../types/admin";

type LoginStep = "credentials" | "mfa" | "backup-codes";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to authenticate";
}

export function AdminLoginPage() {
  const navigate = useNavigate();
  const admin = useAdminStore((state) => state.admin);
  const setSession = useAdminStore((state) => state.setSession);
  const [step, setStep] = useState<LoginStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<AdminLoginChallenge | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (admin && step === "credentials") {
      navigate(admin.mustChangePassword ? "/change-password" : "/", {
        replace: true,
      });
    }
  }, [admin, navigate, step]);

  async function handleCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await beginAdminLogin(email, password);
      setChallenge(result);
      setStep("mfa");
      setCode("");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    setLoading(true);
    setError("");
    try {
      const result = await verifyAdminMfa(challenge.challengeToken, code);
      setSession(result.admin, result.csrfToken);
      if (result.backupCodes?.length) {
        setBackupCodes(result.backupCodes);
        setStep("backup-codes");
      } else {
        navigate(result.admin.mustChangePassword ? "/change-password" : "/", {
          replace: true,
        });
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function copyBackupCodes() {
    await navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function downloadBackupCodes() {
    const content = [
      "BatFIN Admin backup codes",
      "Store these in a secure password manager. Each code works once.",
      "",
      ...backupCodes,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "batfin-admin-backup-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  function continueAfterBackupCodes() {
    if (!admin) return;
    navigate(admin.mustChangePassword ? "/change-password" : "/", {
      replace: true,
    });
  }

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(460px,0.8fr)] lg:gap-6 lg:p-8">
      <section className="relative hidden min-h-[calc(100vh-4rem)] overflow-hidden rounded-3xl bg-forest p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-32 -top-32 size-96 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 size-80 rounded-full bg-secondary/25 blur-3xl" />
        <img alt="BatFIN" className="relative w-44 rounded-xl bg-white p-3" src="/LOGO.png" />
        <div className="relative max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-green-200">
            Restricted administration
          </p>
          <h1 className="mt-4 font-heading text-5xl font-semibold leading-tight">
            Security before operations.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-white/65">
            Admin sessions are separate from customer accounts and protected by password verification, authenticator MFA, CSRF tokens, server-side revocation, and audit logs.
          </p>
        </div>
        <div className="relative flex items-center gap-3 text-sm text-green-100/80">
          <ShieldCheck className="size-5" />
          BatFIN privileged access
        </div>
      </section>

      <section className="flex min-h-[calc(100vh-2rem)] items-center justify-center py-6 sm:min-h-[calc(100vh-3rem)] lg:min-h-0">
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-card sm:p-8">
          <img alt="BatFIN" className="mx-auto w-36 rounded-lg bg-white" src="/LOGO.png" />

          {step === "credentials" ? (
            <>
              <div className="mt-8">
                <div className="grid size-12 place-items-center rounded-2xl bg-green-50 text-primary">
                  <LockKeyhole className="size-6" />
                </div>
                <h2 className="mt-5 font-heading text-3xl font-semibold text-text-primary">
                  Admin sign in
                </h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  Enter your administrator credentials. Customer phone authentication cannot access this portal.
                </p>
              </div>

              {error ? <ErrorAlert message={error} /> : null}

              <form className="mt-7 space-y-5" onSubmit={handleCredentials}>
                <label className="block text-sm font-medium text-text-primary">
                  Admin email
                  <input
                    autoComplete="username"
                    className="mt-2 min-h-12 w-full rounded-xl border border-outline px-4 py-3 outline-none transition focus:border-primary focus:ring-4 focus:ring-green-100"
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    type="email"
                    value={email}
                  />
                </label>
                <label className="block text-sm font-medium text-text-primary">
                  Password
                  <input
                    autoComplete="current-password"
                    className="mt-2 min-h-12 w-full rounded-xl border border-outline px-4 py-3 outline-none transition focus:border-primary focus:ring-4 focus:ring-green-100"
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    type="password"
                    value={password}
                  />
                </label>
                <PrimaryButton loading={loading}>
                  Continue to verification <ArrowRight className="size-4" />
                </PrimaryButton>
              </form>
            </>
          ) : null}

          {step === "mfa" && challenge ? (
            <>
              <div className="mt-8">
                <div className="grid size-12 place-items-center rounded-2xl bg-green-50 text-primary">
                  <KeyRound className="size-6" />
                </div>
                <h2 className="mt-5 font-heading text-3xl font-semibold text-text-primary">
                  {challenge.mfaSetupRequired
                    ? "Set up authenticator"
                    : "Verify authenticator"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {challenge.mfaSetupRequired
                    ? "Scan this QR in your authenticator app, then enter the six-digit code."
                    : "Enter a six-digit authenticator code or one unused backup code."}
                </p>
              </div>

              {challenge.totpSetup ? (
                <div className="mt-6 rounded-2xl border border-outline bg-background p-5 text-center">
                  <QRCodeSVG
                    className="mx-auto rounded-xl bg-white p-3"
                    level="M"
                    size={190}
                    value={challenge.totpSetup.otpauthUri}
                  />
                  <p className="mt-4 text-xs font-medium uppercase tracking-wider text-text-secondary">
                    Manual setup key
                  </p>
                  <p className="mt-2 break-all font-mono text-sm font-semibold tracking-wider text-text-primary">
                    {challenge.totpSetup.secret}
                  </p>
                </div>
              ) : null}

              {error ? <ErrorAlert message={error} /> : null}

              <form className="mt-6 space-y-5" onSubmit={handleMfa}>
                <label className="block text-sm font-medium text-text-primary">
                  Authenticator or backup code
                  <input
                    autoComplete="one-time-code"
                    className="mt-2 min-h-14 w-full rounded-xl border border-outline px-4 py-3 text-center font-mono text-xl font-semibold uppercase tracking-[0.2em] outline-none transition focus:border-primary focus:ring-4 focus:ring-green-100"
                    maxLength={14}
                    onChange={(event) => setCode(event.target.value.toUpperCase())}
                    required
                    value={code}
                  />
                </label>
                <PrimaryButton loading={loading}>
                  Verify and sign in <ArrowRight className="size-4" />
                </PrimaryButton>
                <button
                  className="w-full py-2 text-sm font-semibold text-primary hover:underline"
                  onClick={() => {
                    setStep("credentials");
                    setChallenge(null);
                    setCode("");
                    setError("");
                  }}
                  type="button"
                >
                  Start again
                </button>
              </form>
            </>
          ) : null}

          {step === "backup-codes" ? (
            <>
              <div className="mt-8 text-center">
                <div className="mx-auto grid size-16 place-items-center rounded-full bg-green-50 text-primary">
                  <Check className="size-8" />
                </div>
                <h2 className="mt-5 font-heading text-3xl font-semibold text-text-primary">
                  Save backup codes
                </h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  These codes are shown once. Store them in an approved password manager before continuing.
                </p>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-outline bg-background p-4 font-mono text-sm font-semibold">
                {backupCodes.map((backupCode) => (
                  <code className="rounded-lg bg-white p-2 text-center" key={backupCode}>
                    {backupCode}
                  </code>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-outline px-3 text-sm font-semibold text-text-primary hover:bg-background"
                  onClick={() => void copyBackupCodes()}
                  type="button"
                >
                  {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-outline px-3 text-sm font-semibold text-text-primary hover:bg-background"
                  onClick={downloadBackupCodes}
                  type="button"
                >
                  <Download className="size-4" /> Download
                </button>
              </div>
              <button
                className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-container"
                onClick={continueAfterBackupCodes}
                type="button"
              >
                I stored the codes securely <ArrowRight className="size-4" />
              </button>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="mt-5 flex gap-3 rounded-xl bg-red-50 p-3 text-sm text-error" role="alert">
      <AlertCircle className="size-5 shrink-0" />
      {message}
    </div>
  );
}

function PrimaryButton({
  children,
  loading,
}: {
  children: ReactNode;
  loading: boolean;
}) {
  return (
    <button
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-60"
      disabled={loading}
      type="submit"
    >
      {loading ? (
        <span className="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      ) : (
        children
      )}
    </button>
  );
}
