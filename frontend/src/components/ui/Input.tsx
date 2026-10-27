import { useId, type InputHTMLAttributes, type Ref } from "react";
import { cn } from "../../lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  /** Helper text rendered below the field and linked through aria-describedby. */
  hint?: string;
  ref?: Ref<HTMLInputElement>;
}

export function Input({
  label,
  error,
  hint,
  id,
  className,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy =
    [ariaDescribedBy, hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-300">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={describedBy}
        className={cn(
          "w-full rounded-lg border bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-400 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400",
          error ? "border-red-500" : "border-slate-500",
          className,
        )}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-xs text-slate-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
