import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  LockKeyhole,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { BrandLogo } from "../../components/BrandLogo";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import {
  ApiClientError,
  register as registerAccount,
  sendOtp,
  verifyOtp,
} from "../../services/api";
import { useAuthStore } from "../../store/auth.store";

type AuthMode = "login" | "register";
type AuthStep = "phone" | "otp";

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.logout);
  const [mode, setMode] = useState<AuthMode>("login");
  const [step, setStep] = useState<AuthStep>("phone");
  const [name, setName] = useState("");
  const [customerLoanId,setCustomerLoanId]=useState("");
  const [batteryNo,setBatteryNo]=useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpExpiresIn, setOtpExpiresIn] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "otp") {
      otpInputRef.current?.focus();
    }
  }, [step]);

  useEffect(() => {
    if (step !== "otp") return;

    const interval = window.setInterval(() => {
      setOtpExpiresIn((seconds) => Math.max(0, seconds - 1));
      setResendCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [step]);

  function resetForMode(nextMode: AuthMode) {
    setMode(nextMode);
    setStep("phone");
    setOtp("");
    setError("");
    setNotice("");
    setShowHelp(false);
    setOtpExpiresIn(0);
    setResendCooldown(0);
  }

  function validatePhone() {
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return false;
    }

    if (mode === "register" && name.trim().length < 2) {setError("Enter your full name to create an account.");return false;}
    if(mode==="register"&&Boolean(customerLoanId.trim())!==Boolean(batteryNo.trim())){setError("Enter both Customer Loan ID and battery number, or leave both blank.");return false}
    return true;
  }

  async function handlePhoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!validatePhone()) return;

    // Starting a fresh sign-in removes any stale JWT left by an older sandbox run.
    clearSession();
    setLoading(true);
    try {
      if (mode === "register") {
        await registerAccount({name:name.trim(),phone,...(customerLoanId.trim()&&batteryNo.trim()?{customerLoanId:customerLoanId.trim(),batteryNo:batteryNo.trim()}: {})});
      }
      const otpResult = await sendOtp(phone);
      setOtpExpiresIn(otpResult.expiresInSeconds);
      setResendCooldown(30);
      setStep("otp");
      setNotice(`A 6-digit OTP was sent to +91 ${phone.slice(0, 5)} ${phone.slice(5)}.`);
    } catch (requestError) {
      if (
        requestError instanceof ApiClientError &&
        requestError.code === "USER_NOT_FOUND"
      ) {
        setError("This number is not registered. Create an account to continue.");
      } else if (
        requestError instanceof ApiClientError &&
        requestError.code === "PHONE_ALREADY_REGISTERED"
      ) {
        setError("This number is already registered. Switch to sign in.");
      } else {
        setError(getErrorMessage(requestError));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the complete 6-digit OTP.");
      return;
    }

    if (otpExpiresIn === 0) {
      setError("This OTP has expired. Request a new OTP to continue.");
      return;
    }

    setLoading(true);
    try {
      const session = await verifyOtp(phone, otp);
      setSession(session.token, session.user);
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;

    setError("");
    setNotice("");
    setLoading(true);
    try {
      const otpResult = await sendOtp(phone);
      setOtpExpiresIn(otpResult.expiresInSeconds);
      setResendCooldown(30);
      setOtp("");
      setNotice("A new OTP was sent successfully.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background md:grid md:grid-cols-2">
      <aside className="relative hidden min-h-screen overflow-hidden bg-deep-forest p-12 md:flex md:flex-col md:items-center md:justify-center">
        <div className="absolute -left-32 -top-32 size-96 rounded-full bg-success/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 size-96 rounded-full bg-secondary/25 blur-3xl" />
        <div className="relative z-10 w-full max-w-lg text-center">
          <div className="mx-auto rounded-[28px] bg-white p-7 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
            <BrandLogo className="mx-auto" variant="hero" />
          </div>
          <h1 className="mt-10 font-heading text-4xl font-bold text-white">
            Your EV journey, financed intelligently.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-lg leading-7 text-tertiary-fixed-dim">
            Manage your BatFIN account securely from one simple application.
          </p>
          <div className="mx-auto mt-10 grid max-w-sm grid-cols-3 gap-4">
            {[Phone, ShieldCheck, CheckCircle2].map((Icon, index) => (
              <div
                className="grid aspect-square place-items-center rounded-2xl border border-white/10 bg-white/10 text-primary-fixed"
                key={index}
              >
                <Icon aria-hidden="true" className="size-8" />
              </div>
            ))}
          </div>
        </div>
      </aside>

      <section className="flex min-h-screen flex-col">
        <header className="flex h-24 items-center justify-center px-4 pt-5 md:hidden">
          <BrandLogo variant="auth" />
        </header>

        <div className="flex flex-1 items-start justify-center px-5 pb-12 pt-[clamp(4rem,17vh,9rem)] sm:px-8 md:items-center md:py-12 lg:px-16">
          <div className="w-full max-w-md">
            <div className="page-enter rounded-card bg-white p-8 shadow-card">
              {step === "otp" ? (
                <button
                  className="mb-5 flex size-10 items-center justify-center rounded-full text-primary transition hover:bg-primary/5"
                  onClick={() => {
                    setStep("phone");
                    setOtp("");
                    setError("");
                    setNotice("");
                    setOtpExpiresIn(0);
                    setResendCooldown(0);
                  }}
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" className="size-5" />
                  <span className="sr-only">Change mobile number</span>
                </button>
              ) : null}

              <div className="mb-8">
                <div className="mb-5 hidden size-12 place-items-center rounded-2xl bg-primary/10 text-primary md:grid">
                  {step === "otp" ? (
                    <LockKeyhole aria-hidden="true" className="size-6" />
                  ) : mode === "register" ? (
                    <UserRound aria-hidden="true" className="size-6" />
                  ) : (
                    <ShieldCheck aria-hidden="true" className="size-6" />
                  )}
                </div>
                <h2 className="font-heading text-[32px] font-semibold leading-10 text-text-primary md:text-[28px] md:leading-9">
                  {step === "otp"
                    ? "Verify your number"
                    : mode === "register"
                      ? "Create your account"
                      : "Welcome Back"}
                </h2>
                <p className="mt-3 text-lg leading-7 text-on-surface-variant md:text-base md:leading-6">
                  {step === "otp"
                    ? `Enter the OTP sent to +91 ${phone}.`
                    : mode === "register"
                      ? "Register your name and mobile number with BatFIN."
                      : "Enter your registered mobile number to access your dashboard."}
                </p>
              </div>

              {error ? (
                <div
                  className="mb-5 flex gap-3 rounded-xl bg-error-container p-3 text-sm text-on-error-container"
                  role="alert"
                >
                  <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              {notice ? (
                <div
                  className="mb-5 flex gap-3 rounded-xl bg-primary/10 p-3 text-sm text-primary"
                  role="status"
                >
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                  <span>{notice}</span>
                </div>
              ) : null}

              {step === "phone" ? (
                <form className="space-y-5" onSubmit={handlePhoneSubmit}>
                  {mode === "register" ? (<><TextField autoComplete="name" id="name" label="Full Name" maxLength={80} onChange={event=>setName(event.target.value)} placeholder="As written in your BatFIN agreement" value={name}/><div className="rounded-xl bg-surface-container-low p-4"><p className="text-sm font-semibold text-text-primary">Already have a BatFIN battery-finance agreement?</p><p className="mt-1 text-xs leading-5 text-text-secondary">Enter both fields to securely link the imported agreement to this login. Leave both blank for a new standalone account.</p><div className="mt-3 space-y-3"><TextField autoComplete="off" id="customerLoanId" label="Customer Loan ID (optional)" maxLength={80} onChange={event=>setCustomerLoanId(event.target.value.toUpperCase())} placeholder="Enter your loan account ID" value={customerLoanId}/><TextField autoComplete="off" id="batteryNo" label="Battery Number (optional)" maxLength={120} onChange={event=>setBatteryNo(event.target.value)} placeholder="Battery serial from your agreement" value={batteryNo}/></div></div></>) : null}
                  <TextField
                    autoComplete="tel-national"
                    id="phone"
                    className="text-[20px] font-semibold tracking-wide tabular-nums min-[380px]:text-[28px]"
                    inputMode="numeric"
                    label="Mobile Number"
                    leading={
                      <span className="border-r border-outline-variant pr-3 text-sm font-medium text-on-surface-variant">
                        +91
                      </span>
                    }
                    maxLength={10}
                    onChange={(event) =>
                      setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    pattern="[6-9][0-9]{9}"
                    placeholder="00000 00000"
                    required
                    value={phone}
                  />
                  <Button className="min-h-14 text-base" fullWidth loading={loading} type="submit">
                    {mode === "register" ? "Register & Get OTP" : "Get OTP"}
                    {!loading ? <ArrowRight aria-hidden="true" className="size-4" /> : null}
                  </Button>
                  <p className="text-center text-sm text-on-surface-variant">
                    {mode === "login" ? "New to BatFIN?" : "Already registered?"}{" "}
                    <button
                      className="font-semibold text-primary hover:underline"
                      onClick={() => resetForMode(mode === "login" ? "register" : "login")}
                      type="button"
                    >
                      {mode === "login" ? "Create account" : "Sign in"}
                    </button>
                  </p>
                </form>
              ) : (
                <form className="space-y-5" onSubmit={handleOtpSubmit}>
                  <TextField
                    autoComplete="one-time-code"
                    className="text-center font-semibold tracking-[0.65em] tabular-nums"
                    id="otp"
                    inputMode="numeric"
                    label="One-Time Password"
                    maxLength={6}
                    onChange={(event) =>
                      setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="••••••"
                    ref={otpInputRef}
                    required
                    value={otp}
                  />
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-low px-3 py-2 text-xs text-text-secondary">
                    <span>
                      Development OTP: <strong className="text-primary">123456</strong>
                    </span>
                    <span className={`shrink-0 font-semibold tabular-nums ${otpExpiresIn < 60 ? "text-error" : "text-primary"}`}>
                      {otpExpiresIn > 0 ? formatCountdown(otpExpiresIn) : "Expired"}
                    </span>
                  </div>
                  <Button fullWidth loading={loading} type="submit">
                    Verify & Continue
                    {!loading ? <ArrowRight aria-hidden="true" className="size-4" /> : null}
                  </Button>
                  <button
                    className="w-full py-2 text-sm font-semibold text-primary hover:underline disabled:text-outline"
                    disabled={loading || resendCooldown > 0}
                    onClick={() => void handleResend()}
                    type="button"
                  >
                    {resendCooldown > 0
                      ? `Resend available in ${resendCooldown}s`
                      : "Resend OTP"}
                  </button>
                </form>
              )}

              {step === "phone" ? (
                <div className="mt-8">
                  <div className="flex items-center gap-5">
                    <div className="h-px flex-1 bg-outline-variant" />
                    <span className="text-sm font-medium text-on-surface-variant">or</span>
                    <div className="h-px flex-1 bg-outline-variant" />
                  </div>
                  <Button
                    className="mt-7 min-h-14 text-base"
                    fullWidth
                    onClick={() => setShowHelp((visible) => !visible)}
                    variant="secondary"
                  >
                    <CircleHelp aria-hidden="true" className="size-5" />
                    Need Help?
                  </Button>
                  {showHelp ? (
                    <div className="mt-4 rounded-xl bg-surface-container-low p-4 text-center text-sm leading-6 text-on-surface-variant">
                      <p>
                        {mode === "login"
                          ? "Use the mobile number registered with your BatFIN agreement."
                          : "Enter the account holder name exactly as it should appear in BatFIN."}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <p className="mt-7 text-center text-xs leading-5 text-text-secondary">
              By proceeding, you agree to BatFIN&apos;s Terms and Conditions and Privacy Policy.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
