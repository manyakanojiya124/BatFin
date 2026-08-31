import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  leading?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    { className = "", error, id, label, leading, ...props },
    ref,
  ) {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-on-surface" htmlFor={id}>
          {label}
        </label>
        <div className="relative flex items-center">
          {leading ? (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
              {leading}
            </div>
          ) : null}
          <input
            aria-describedby={error ? `${id}-error` : undefined}
            aria-invalid={Boolean(error)}
            className={`min-h-12 w-full rounded-xl border-[1.5px] bg-white px-4 py-3 text-on-surface outline-none transition placeholder:text-outline/70 focus:border-success focus:shadow-[0_0_0_3px_rgba(22,163,74,0.14)] ${leading ? "pl-[4.5rem]" : ""} ${error ? "border-error" : "border-outline-variant"} ${className}`}
            id={id}
            ref={ref}
            {...props}
          />
        </div>
        {error ? (
          <p className="text-sm text-error" id={`${id}-error`} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
