import { useId, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export function Textarea({ label, id, className, ...props }: TextareaProps) {
  const generatedId = useId();
  const textareaId = id || generatedId;

  return (
    <div className="space-y-1">
      <label htmlFor={textareaId} className="block text-sm font-medium text-slate-300">
        {label}
      </label>
      <textarea
        id={textareaId}
        className={cn(
          "w-full rounded-lg border border-slate-500 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-400 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400",
          className,
        )}
        {...props}
      />
    </div>
  );
}
