import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface BottomSheetProps {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title: string;
}

export function BottomSheet({
  children,
  isOpen,
  onClose,
  title,
}: BottomSheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      aria-labelledby="bottom-sheet-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-end justify-center md:items-center md:p-6"
      role="dialog"
    >
      <button
        aria-label="Close dialog"
        className="sheet-backdrop absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />
      <section
        className="sheet-enter relative z-10 max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[28px] bg-white shadow-[0_-10px_40px_rgba(0,0,0,.16)] md:max-h-[88dvh] md:rounded-card md:shadow-[0_20px_60px_rgba(0,0,0,.2)]"
        ref={panelRef}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-surface-container bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-surface-container-high md:hidden" />
            <h2
              className="truncate font-heading text-xl font-semibold text-text-primary sm:text-2xl"
              id="bottom-sheet-title"
            >
              {title}
            </h2>
          </div>
          <button
            aria-label="Close"
            className="grid size-10 shrink-0 place-items-center rounded-full text-on-surface-variant transition hover:bg-surface-container"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
