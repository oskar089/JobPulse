import { useId, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
}

export function Select({ label, options, id, className, ...props }: SelectProps) {
  const generatedId = useId();
  const selectId = id || generatedId;

  return (
    <div className="space-y-1">
      <label htmlFor={selectId} className="block text-sm font-medium text-slate-300">
        {label}
      </label>
      <select
        id={selectId}
        className={cn(
          "w-full rounded-lg border border-slate-500 bg-slate-800 px-3 py-2 text-sm text-white transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400",
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
