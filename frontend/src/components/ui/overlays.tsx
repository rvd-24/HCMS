import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/5 text-ink-soft transition-all hover:rotate-90 hover:bg-ink hover:text-white"
      aria-label="Close"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEscape(open, onClose);
  if (!open) return null;
  const width = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <div
        className={clsx("relative flex max-h-[92vh] w-full animate-scale-in flex-col overflow-hidden rounded-t-4xl bg-white shadow-pop sm:rounded-4xl", width)}
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-brand-100/60 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4 px-6 pb-3 pt-6">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h2>
            {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
          </div>
          <CloseButton onClose={onClose} />
        </div>
        <div className="relative overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="relative flex justify-end gap-2 border-t border-line/70 bg-canvas/40 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-ink/25 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md animate-slide-in-right flex-col overflow-hidden bg-white shadow-pop sm:inset-y-3 sm:right-3 sm:rounded-4xl">
        <div className="pointer-events-none absolute -left-10 -top-16 h-44 w-44 rounded-full bg-brand-100/70 blur-3xl" />
        <div className="relative flex items-center justify-between gap-3 px-6 pb-4 pt-6">
          <div className="min-w-0 font-display text-xl font-semibold text-ink">{title}</div>
          <CloseButton onClose={onClose} />
        </div>
        <div className="relative flex-1 overflow-y-auto px-6 py-2">{children}</div>
        {footer && <div className="relative border-t border-line/70 bg-canvas/40 px-6 py-4">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}
