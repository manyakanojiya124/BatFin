import { ArrowLeft } from "lucide-react";

import { BrandLogo } from "./BrandLogo";

interface PageHeaderProps {
  title: string;
  initials: string;
  onBack?: () => void;
}

export function PageHeader({ initials, onBack, title }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-8">
        {onBack ? (
          <button
            aria-label="Go back"
            className="flex size-10 items-center justify-center rounded-full text-primary transition hover:bg-primary/5 active:scale-95"
            onClick={onBack}
            type="button"
          >
            <ArrowLeft aria-hidden="true" className="size-6" />
          </button>
        ) : (
          <div className="size-10" />
        )}
        {title === "BatFIN" ? (
          <BrandLogo variant="compact" />
        ) : (
          <h1 className="max-w-[calc(100vw-7rem)] truncate px-2 text-center font-heading text-xl font-bold text-primary sm:text-2xl">
            {title}
          </h1>
        )}
        <div
          aria-label="Your profile"
          className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-primary-fixed to-success text-sm font-bold text-on-primary-fixed shadow-sm"
        >
          {initials}
        </div>
      </div>
    </header>
  );
}
