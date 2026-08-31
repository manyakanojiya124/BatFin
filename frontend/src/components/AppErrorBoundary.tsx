import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("BatFIN UI error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-background px-4">
          <section className="w-full max-w-md rounded-card bg-white p-8 text-center shadow-card">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-error-container text-error">
              <AlertTriangle aria-hidden="true" className="size-7" />
            </div>
            <h1 className="mt-5 font-heading text-2xl font-semibold text-text-primary">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              BatFIN could not display this screen. Refresh the app to try again.
            </p>
            <button
              className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-success px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-container active:scale-[0.98]"
              onClick={() => window.location.reload()}
              type="button"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              Refresh app
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
