import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  loading?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  fullWidth?: boolean;
}

const variantClasses = {
  primary:
    "bg-success text-white shadow-sm hover:bg-primary-container disabled:bg-outline-variant",
  secondary:
    "border-2 border-success bg-transparent text-success hover:bg-success/5 disabled:border-outline-variant disabled:text-outline",
  danger:
    "border border-error/30 bg-transparent text-error hover:bg-error/5 disabled:text-outline",
  ghost: "bg-transparent text-primary hover:bg-primary/5 disabled:text-outline",
};

export function Button({
  children,
  className = "",
  disabled,
  fullWidth = false,
  loading = false,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${variantClasses[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : null}
      {children}
    </button>
  );
}
