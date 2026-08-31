import {
  ArrowRight,
  CheckCircle2,
  Info,
  LifeBuoy,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router-dom";

import { BottomNavigation } from "../../components/BottomNavigation";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { PageHeader } from "../../components/PageHeader";
import { ProfileSkeleton } from "../../components/LoadingSkeleton";
import { TextField } from "../../components/TextField";
import { ApiClientError, getMe, updateMe } from "../../services/api";
import { useAuthStore } from "../../store/auth.store";
import type { User } from "../../types/api";

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "BF"
  );
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return phone;
}

interface ProfileRowProps {
  icon: ReactNode;
  label: string;
  value?: ReactNode;
}

function ProfileRow({ icon, label, value }: ProfileRowProps) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-3 rounded-xl px-3 py-3 transition hover:bg-surface-container-low">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-container text-on-surface-variant">
          {icon}
        </div>
        <span className="text-base text-text-primary">{label}</span>
      </div>
      <div className="min-w-0 text-right text-sm text-text-secondary">{value}</div>
    </div>
  );
}

interface EditProfileFormProps {
  token: string;
  user: User;
  onCancel: () => void;
  onSaved: (user: User) => void;
}

function EditProfileForm({ token, user, onCancel, onSaved }: EditProfileFormProps) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? "");
  const [address, setAddress] = useState(user.address ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (name.trim().length < 2) {
      setError("Name must contain at least 2 characters.");
      return;
    }

    setLoading(true);
    try {
      const result = await updateMe(token, {
        name: name.trim(),
        email: email.trim() || null,
        address: address.trim() || null,
      });
      onSaved(result.user);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save your profile.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="page-enter p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Personal Information
          </p>
          <h3 className="mt-1 font-heading text-xl font-semibold">Edit profile</h3>
        </div>
        <button
          aria-label="Cancel editing"
          className="grid size-10 place-items-center rounded-full text-on-surface-variant hover:bg-surface-container"
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>

      {error ? (
        <p className="mb-5 rounded-xl bg-error-container p-3 text-sm text-on-error-container" role="alert">
          {error}
        </p>
      ) : null}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <TextField
          autoComplete="name"
          id="profile-name"
          label="Full Name"
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
        <TextField
          autoComplete="email"
          id="profile-email"
          label="Email Address"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          type="email"
          value={email}
        />
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="profile-address">
            Address
          </label>
          <textarea
            className="min-h-28 w-full resize-y rounded-xl border-[1.5px] border-outline-variant bg-white px-4 py-3 text-base outline-none transition placeholder:text-outline/70 focus:border-success focus:shadow-[0_0_0_3px_rgba(22,163,74,0.14)]"
            id="profile-address"
            maxLength={250}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Your current address"
            value={address}
          />
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button onClick={onCancel} variant="secondary">
            Cancel
          </Button>
          <Button loading={loading} type="submit">
            {!loading ? <Save aria-hidden="true" className="size-4" /> : null}
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function ProfilePage() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const [loading, setLoading] = useState(!user);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");

  const loadProfile = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError("");
    try {
      const result = await getMe(token);
      setUser(result.user);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load your profile.",
      );
    } finally {
      setLoading(false);
    }
  }, [logout, navigate, setUser, token]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!saveNotice) return;

    const timeout = window.setTimeout(() => setSaveNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [saveNotice]);

  const displayInitials = initials(user?.name ?? "BatFIN User");

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-10">
      <PageHeader
        initials={displayInitials}
        onBack={() => navigate("/dashboard")}
        title="Profile"
      />

      {loading && !user ? (
        <ProfileSkeleton />
      ) : error ? (
        <main className="mx-auto w-full max-w-xl px-4 py-12">
          <Card className="p-8 text-center">
            <RefreshCw aria-hidden="true" className="mx-auto size-9 text-error" />
            <h2 className="mt-4 font-heading text-xl font-semibold">Unable to load profile</h2>
            <p className="mt-2 text-sm text-text-secondary">{error}</p>
            <Button className="mt-6" onClick={() => void loadProfile()}>
              Try again
            </Button>
          </Card>
        </main>
      ) : user && token ? (
        <main className="page-enter mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8">
          <section className="flex flex-col items-center pb-8 pt-4 text-center">
            <div className="grid size-24 place-items-center rounded-full border-4 border-white bg-gradient-to-br from-primary-fixed to-success text-2xl font-bold text-on-primary-fixed shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
              {displayInitials}
            </div>
            <h2 className="mt-5 font-heading text-[28px] font-semibold leading-9 text-text-primary md:text-3xl">
              {user.name}
            </h2>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-sm font-medium text-primary-container">
              <ShieldCheck aria-hidden="true" className="size-4" />
              Verified Member
            </span>
            <Button className="mt-4" onClick={() => setEditing(true)} variant="ghost">
              <Pencil aria-hidden="true" className="size-4" />
              Edit Profile
            </Button>
          </section>

          {saveNotice ? (
            <div
              className="flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary"
              role="status"
            >
              <CheckCircle2 aria-hidden="true" className="size-5" />
              {saveNotice}
            </div>
          ) : null}

          {editing ? (
            <EditProfileForm
              onCancel={() => setEditing(false)}
              onSaved={(updatedUser) => {
                setUser(updatedUser);
                setEditing(false);
                setSaveNotice("Your profile was updated successfully.");
              }}
              token={token}
              user={user}
            />
          ) : null}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card className="p-2">
              <div className="px-4 py-3">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-text-secondary">
                  Account
                </h3>
                <div className="flex flex-col">
                  <ProfileRow
                    icon={<UserRound aria-hidden="true" className="size-5" />}
                    label="Personal Information"
                    value={
                      <button
                        aria-label="Edit personal information"
                        className="inline-flex items-center gap-1 text-primary"
                        onClick={() => setEditing(true)}
                        type="button"
                      >
                        Edit <ArrowRight aria-hidden="true" className="size-4" />
                      </button>
                    }
                  />
                  <ProfileRow
                    icon={<Phone aria-hidden="true" className="size-5" />}
                    label="Mobile Number"
                    value={
                      <span className="inline-flex items-center gap-1 font-medium text-success">
                        <CheckCircle2 aria-hidden="true" className="size-4" />
                        {formatPhone(user.phone)}
                      </span>
                    }
                  />
                  <ProfileRow
                    icon={<Mail aria-hidden="true" className="size-5" />}
                    label="Email"
                    value={user.email ?? "Not provided"}
                  />
                </div>
              </div>
            </Card>

            <Card className="p-2">
              <div className="px-4 py-3">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-text-secondary">
                  Contact Details
                </h3>
                <ProfileRow
                  icon={<MapPin aria-hidden="true" className="size-5" />}
                  label="Address"
                  value={
                    <span className="line-clamp-3 max-w-48">
                      {user.address ?? "Not provided"}
                    </span>
                  }
                />
                <ProfileRow
                  icon={<LifeBuoy aria-hidden="true" className="size-5" />}
                  label="Help & Support"
                  value={
                    <Link className="inline-flex items-center gap-1 font-semibold text-primary" to="/support">
                      Open <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                  }
                />
                <ProfileRow
                  icon={<Info aria-hidden="true" className="size-5" />}
                  label="App Version"
                  value="v0.1.0"
                />
              </div>
            </Card>
          </div>

          <section className="mt-4 flex justify-center">
            <Button fullWidth onClick={handleLogout} variant="danger" className="md:w-auto">
              <LogOut aria-hidden="true" className="size-5" />
              Logout
            </Button>
          </section>
        </main>
      ) : null}

      <BottomNavigation active="profile" />
    </div>
  );
}
