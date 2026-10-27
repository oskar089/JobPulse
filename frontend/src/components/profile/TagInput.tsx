import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Badge } from "../ui/Badge";
import { cn, focusRing } from "../../lib/utils";

interface TagInputProps {
  label: string;
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (index: number) => void;
  placeholder?: string;
}

export function TagInput({ label, tags, onAdd, onRemove, placeholder }: TagInputProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = useId();

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      onAdd(input.trim());
      setInput("");
    }
  };

  const handleRemove = (index: number) => {
    onRemove(index);
    // The removed button disappears; keep keyboard focus in the field instead of losing it
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-300">{label}</label>
      <ul aria-label={`${label} added`} className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag, i) => (
          <li key={`${tag}-${i}`}>
            <Badge variant="info">
              {tag}
              <button
                type="button"
                onClick={() => handleRemove(i)}
                aria-label={`Remove ${tag}`}
                className={cn("ml-1.5 rounded text-blue-200 hover:text-white", focusRing)}
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </Badge>
          </li>
        ))}
      </ul>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-describedby={hintId}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400"
      />
      <p id={hintId} className="text-xs text-slate-400">Type a value and press Enter to add it.</p>
    </div>
  );
}
