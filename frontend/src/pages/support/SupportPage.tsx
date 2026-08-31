import {
  AlertCircle,
  ArrowRight,
  BatteryCharging,
  CarFront,
  CircleHelp,
  ClipboardList,
  FileWarning,
  Flag,
  HeartPulse,
  MessageSquareWarning,
  PauseCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  TicketCheck,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";

import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { LoadingSkeleton } from "../../components/LoadingSkeleton";
import { PageHeader } from "../../components/PageHeader";
import {
  ApiClientError,
  createSupportTicket,
  listAssets,
  listSupportTickets,
} from "../../services/api";
import { useAuthStore } from "../../store/auth.store";
import type {
  Asset,
  SupportTicket,
  SupportTicketType,
} from "../../types/api";

interface TicketTypeConfig {
  label: string;
  description: string;
  icon: LucideIcon;
  iconClass: string;
}

const ticketTypeConfigs: Record<SupportTicketType, TicketTypeConfig> = {
  ACCIDENT: {
    label: "Report Accident",
    description: "Vehicle or battery accident",
    icon: CarFront,
    iconClass: "bg-error/10 text-error",
  },
  HEALTH_ISSUE: {
    label: "Asset Health Issue",
    description: "Battery or device problem",
    icon: HeartPulse,
    iconClass: "bg-warning/10 text-warning",
  },
  LEASE_PAUSE: {
    label: "Pause Lease",
    description: "Request a temporary pause",
    icon: PauseCircle,
    iconClass: "bg-warning/10 text-warning",
  },
  NOC_TRANSFER: {
    label: "NOC or Transfer",
    description: "Ownership documentation",
    icon: ClipboardList,
    iconClass: "bg-secondary/10 text-secondary",
  },
  COMPLAINT: {
    label: "Lodge Complaint",
    description: "Report a service concern",
    icon: MessageSquareWarning,
    iconClass: "bg-error/10 text-error",
  },
  FORECLOSURE: {
    label: "Foreclosure",
    description: "Request early lease closure",
    icon: Flag,
    iconClass: "bg-surface-container text-on-surface-variant",
  },
  REPORT_ISSUE: {
    label: "Report App Issue",
    description: "Technical application problem",
    icon: FileWarning,
    iconClass: "bg-primary/10 text-primary",
  },
  OTHER: {
    label: "Other Support",
    description: "Anything else we can help with",
    icon: CircleHelp,
    iconClass: "bg-tertiary-fixed text-on-primary-fixed",
  },
};

const ticketTypeOrder = Object.keys(ticketTypeConfigs) as SupportTicketType[];

const statusStyles: Record<SupportTicket["status"], string> = {
  open: "bg-secondary/10 text-secondary",
  in_progress: "bg-warning/10 text-warning",
  resolved: "bg-success/10 text-primary",
  closed: "bg-surface-container text-text-secondary",
};

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

function formatTicketStatus(status: SupportTicket["status"]) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function SupportSkeleton() {
  return (
    <div className="space-y-8">
      <LoadingSkeleton className="h-14 rounded-xl" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
          <LoadingSkeleton className="h-36 rounded-card" key={item} />
        ))}
      </div>
      <LoadingSkeleton className="h-52 rounded-card" />
    </div>
  );
}

export function SupportPage() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedType, setSelectedType] = useState<SupportTicketType | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const loadSupport = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError("");
    try {
      const [ticketResult, assetResult] = await Promise.all([
        listSupportTickets(token),
        listAssets(token),
      ]);
      setTickets(ticketResult.tickets);
      setAssets(assetResult.assets);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load support.",
      );
    } finally {
      setLoading(false);
    }
  }, [logout, navigate, token]);

  useEffect(() => {
    void loadSupport();
  }, [loadSupport]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const filteredTypes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return ticketTypeOrder;
    return ticketTypeOrder.filter((type) => {
      const config = ticketTypeConfigs[type];
      return (
        config.label.toLowerCase().includes(query) ||
        config.description.toLowerCase().includes(query)
      );
    });
  }, [search]);

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tickets;
    return tickets.filter(
      (ticket) =>
        ticketTypeConfigs[ticket.type].label.toLowerCase().includes(query) ||
        ticket.description.toLowerCase().includes(query),
    );
  }, [search, tickets]);

  function openTicketForm(type: SupportTicketType) {
    setSelectedType(type);
    const preferredAsset =
      assets.find((asset) => asset.assetType === "battery") ?? assets[0];
    setSelectedAssetId(preferredAsset?.id ?? "");
    setDescription("");
    setFormError("");
  }

  const closeTicketForm = useCallback(() => {
    if (submitting) return;
    setSelectedType(null);
    setDescription("");
    setFormError("");
  }, [submitting]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!token || !selectedType) return;
    if (description.trim().length < 10) {
      setFormError("Please provide at least 10 characters describing the issue.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createSupportTicket(token, {
        type: selectedType,
        assetId: selectedAssetId || null,
        description: description.trim(),
      });
      setTickets((current) => [result.ticket, ...current]);
      setNotice(`Ticket ${result.ticket.id.slice(0, 8).toUpperCase()} was created successfully.`);
      setSelectedType(null);
      setDescription("");
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setFormError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create this ticket.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const primaryAsset =
    assets.find((asset) => asset.assetType === "battery") ?? assets[0] ?? null;

  return (
    <div className="min-h-screen bg-background pb-10">
      <PageHeader
        initials={initials(user?.name ?? "BatFIN User")}
        onBack={() => navigate("/dashboard")}
        title="BatFIN"
      />
      <main className="page-enter mx-auto w-full max-w-app px-4 py-6 sm:px-6 md:px-8 md:py-10">
        <div className="mb-7">
          <p className="text-sm font-medium text-text-secondary">Customer assistance</p>
          <h1 className="mt-1 font-heading text-3xl font-semibold text-text-primary sm:text-4xl">
            Support Hub
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary sm:text-base">
            Select an issue type and send the details directly to BatFIN support.
          </p>
        </div>

        {loading ? (
          <SupportSkeleton />
        ) : error ? (
          <Card className="p-8 text-center">
            <RefreshCw aria-hidden="true" className="mx-auto size-9 text-error" />
            <h2 className="mt-4 font-heading text-xl font-semibold">Unable to load support</h2>
            <p className="mt-2 text-sm text-text-secondary">{error}</p>
            <Button className="mt-6" onClick={() => void loadSupport()}>
              Try again
            </Button>
          </Card>
        ) : (
          <>
            {notice ? (
              <div className="mb-6 flex items-start gap-3 rounded-xl bg-success/10 p-4 text-sm font-medium text-primary" role="status">
                <TicketCheck aria-hidden="true" className="size-5 shrink-0" />
                {notice}
              </div>
            ) : null}

            <div className="relative mx-auto mb-8 max-w-2xl">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-on-surface-variant"
              />
              <input
                aria-label="Search support options and tickets"
                className="min-h-14 w-full rounded-xl border-[1.5px] border-outline-variant bg-white py-3 pl-12 pr-4 text-base shadow-card outline-none transition placeholder:text-text-secondary focus:border-primary focus:shadow-[0_0_0_3px_rgba(22,163,74,.14)]"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search support options or tickets"
                type="search"
                value={search}
              />
            </div>

            <section>
              <h2 className="font-heading text-xl font-semibold text-text-primary sm:text-2xl">
                Quick Actions
              </h2>
              {filteredTypes.length > 0 ? (
                <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
                  {filteredTypes.map((type) => {
                    const config = ticketTypeConfigs[type];
                    const Icon = config.icon;
                    return (
                      <button
                        className="group flex min-h-40 flex-col items-center justify-center rounded-card border border-transparent bg-white p-4 text-center shadow-card transition hover:-translate-y-0.5 hover:border-primary/15 hover:shadow-card-hover active:scale-[0.98] sm:p-5"
                        key={type}
                        onClick={() => openTicketForm(type)}
                        type="button"
                      >
                        <span className={`grid size-12 place-items-center rounded-full transition group-hover:scale-105 ${config.iconClass}`}>
                          <Icon aria-hidden="true" className="size-6" />
                        </span>
                        <span className="mt-3 text-sm font-semibold text-text-primary">
                          {config.label}
                        </span>
                        <span className="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">
                          {config.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Card className="mt-5 p-8 text-center text-sm text-text-secondary">
                  No support options match your search.
                </Card>
              )}
            </section>

            <section className="mt-10">
              <h2 className="font-heading text-xl font-semibold text-text-primary sm:text-2xl">
                Help Center
              </h2>
              <Card className="mt-5 overflow-hidden">
                <Link
                  className="flex items-center justify-between gap-4 border-b border-surface-container p-5 transition hover:bg-surface-container-low sm:p-6"
                  to="/ledger"
                >
                  <span className="flex items-center gap-4">
                    <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      <CreditCardIcon />
                    </span>
                    <span className="font-semibold text-text-primary">Payments and Ledger</span>
                  </span>
                  <ArrowRight aria-hidden="true" className="size-5 text-text-secondary" />
                </Link>
                <Link
                  className="flex items-center justify-between gap-4 border-b border-surface-container p-5 transition hover:bg-surface-container-low sm:p-6"
                  to={primaryAsset ? `/assets/${primaryAsset.id}/health` : "/assets"}
                >
                  <span className="flex items-center gap-4">
                    <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      <HeartPulse aria-hidden="true" className="size-5" />
                    </span>
                    <span className="font-semibold text-text-primary">Asset Health</span>
                  </span>
                  <ArrowRight aria-hidden="true" className="size-5 text-text-secondary" />
                </Link>
                <Link
                  className="flex items-center justify-between gap-4 p-5 transition hover:bg-surface-container-low sm:p-6"
                  to="/plans"
                >
                  <span className="flex items-center gap-4">
                    <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      <ClipboardList aria-hidden="true" className="size-5" />
                    </span>
                    <span className="font-semibold text-text-primary">Leasing Plans</span>
                  </span>
                  <ArrowRight aria-hidden="true" className="size-5 text-text-secondary" />
                </Link>
              </Card>
            </section>

            <section className="mt-10">
              <div className="relative overflow-hidden rounded-card bg-deep-forest p-7 text-center text-white shadow-card sm:p-9">
                <div className="absolute -right-20 -top-20 size-60 rounded-full bg-success/20 blur-3xl" />
                <div className="relative">
                  <h2 className="font-heading text-2xl font-semibold sm:text-3xl">Still need help?</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-tertiary-fixed-dim">
                    Create a support ticket and track its status from this page.
                  </p>
                  <Button className="mt-6" onClick={() => openTicketForm("OTHER")}>
                    <Send aria-hidden="true" className="size-4" />
                    Create Support Ticket
                  </Button>
                </div>
              </div>
            </section>

            <section className="mt-10">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-text-secondary">Submitted by you</p>
                  <h2 className="font-heading text-xl font-semibold text-text-primary sm:text-2xl">
                    Your Tickets
                  </h2>
                </div>
                <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-semibold text-text-secondary">
                  {filteredTickets.length}
                </span>
              </div>

              {filteredTickets.length === 0 ? (
                <Card className="mt-5 px-6 py-10 text-center">
                  <TicketCheck aria-hidden="true" className="mx-auto size-9 text-text-secondary" />
                  <h3 className="mt-4 font-semibold text-text-primary">No tickets found</h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    {search
                      ? "No submitted tickets match your search."
                      : "Tickets you submit will appear here."}
                  </p>
                </Card>
              ) : (
                <div className="mt-5 space-y-4">
                  {filteredTickets.map((ticket) => {
                    const config = ticketTypeConfigs[ticket.type];
                    const Icon = config.icon;
                    return (
                      <Card className="p-5 sm:p-6" key={ticket.id}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${config.iconClass}`}>
                              <Icon aria-hidden="true" className="size-5" />
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-semibold text-text-primary">{config.label}</h3>
                                <span className="rounded-full bg-surface-container px-2 py-0.5 text-[9px] font-semibold uppercase text-text-secondary">
                                  {ticket.priority}
                                </span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-sm leading-5 text-text-secondary">
                                {ticket.description}
                              </p>
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold ${statusStyles[ticket.status]}`}>
                            {formatTicketStatus(ticket.status)}
                          </span>
                        </div>
                        {ticket.resolutionMessage ? (
                          <div className="mt-4 rounded-xl bg-success/10 p-3 text-sm leading-5 text-primary">
                            <strong>Resolution:</strong> {ticket.resolutionMessage}
                          </div>
                        ) : null}
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-surface-container pt-4 text-xs text-text-secondary">
                          <span className="font-medium tabular-nums">
                            #{ticket.id.slice(0, 8).toUpperCase()}
                          </span>
                          <span>
                            {new Intl.DateTimeFormat("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Asia/Kolkata",
                            }).format(new Date(ticket.createdAt))}
                          </span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <BottomSheet
        isOpen={selectedType !== null}
        onClose={closeTicketForm}
        title={selectedType ? ticketTypeConfigs[selectedType].label : "Support Ticket"}
      >
        <form className="space-y-5 p-5 sm:p-6" onSubmit={handleSubmit}>
          {formError ? (
            <div className="flex gap-3 rounded-xl bg-error-container p-3 text-sm text-on-error-container" role="alert">
              <AlertCircle aria-hidden="true" className="size-5 shrink-0" />
              {formError}
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-sm font-medium text-on-surface" htmlFor="ticket-asset">
              Related Asset <span className="font-normal text-text-secondary">(optional)</span>
            </label>
            <div className="relative">
              <BatteryCharging
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-primary"
              />
              <select
                className="min-h-12 w-full appearance-none rounded-xl border-[1.5px] border-outline-variant bg-white py-3 pl-12 pr-10 outline-none transition focus:border-primary focus:shadow-[0_0_0_3px_rgba(22,163,74,.14)]"
                id="ticket-asset"
                onChange={(event) => setSelectedAssetId(event.target.value)}
                value={selectedAssetId}
              >
                <option value="">No specific asset</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.productType} · {asset.serialNumber}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-on-surface" htmlFor="ticket-description">
                Describe the issue
              </label>
              <span className="text-xs tabular-nums text-text-secondary">
                {description.length}/1000
              </span>
            </div>
            <textarea
              autoFocus
              className="min-h-36 w-full resize-y rounded-xl border-[1.5px] border-outline-variant bg-white px-4 py-3 outline-none transition placeholder:text-outline/70 focus:border-primary focus:shadow-[0_0_0_3px_rgba(22,163,74,.14)]"
              id="ticket-description"
              maxLength={1000}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Tell us what happened and include any details that will help us investigate."
              required
              value={description}
            />
          </div>

          <div className="flex items-start gap-2 rounded-xl bg-primary/5 p-3 text-xs leading-5 text-on-surface-variant">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            Your ticket will be linked only to your BatFIN account and selected asset.
          </div>

          <div className="safe-bottom flex flex-col-reverse gap-3 border-t border-surface-container pt-4 sm:flex-row sm:justify-end">
            <Button disabled={submitting} onClick={closeTicketForm} variant="ghost">
              Cancel
            </Button>
            <Button loading={submitting} type="submit">
              <Send aria-hidden="true" className="size-4" />
              Submit Ticket
            </Button>
          </div>
        </form>
      </BottomSheet>
    </div>
  );
}

function CreditCardIcon() {
  return <WalletCards aria-hidden="true" className="size-5" />;
}
