import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";
import { Badge } from "../ui/Badge";
import { cn, focusRing } from "../../lib/utils";
import type { SkillItem } from "../../types";

const DEFAULT_SKILL_LEVEL = "intermediate";

const SKILL_LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
];

function skillLevelLabel(level: string): string {
  return SKILL_LEVELS.find((sl) => sl.value === level)?.label ?? level;
}

interface SkillTagInputProps {
  skills: SkillItem[];
  onAdd: (skill: SkillItem) => void;
  onRemove: (index: number) => void;
}

export function SkillTagInput({ skills, onAdd, onRemove }: SkillTagInputProps) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState(DEFAULT_SKILL_LEVEL);
  const nameRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const levelId = useId();

  const handleAdd = () => {
    if (name.trim()) {
      onAdd({ name: name.trim(), level });
      setName("");
      setLevel(DEFAULT_SKILL_LEVEL);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleRemove = (index: number) => {
    onRemove(index);
    nameRef.current?.focus();
  };

  return (
    <fieldset className="space-y-1">
      <legend className="block text-sm font-medium text-slate-300">Skills</legend>
      <ul aria-label="Skills added" className="flex flex-wrap gap-1.5 mb-2">
        {skills.map((skill, i) => (
          <li key={`${skill.name}-${i}`}>
            <Badge variant="info">
              {skill.name} ({skillLevelLabel(skill.level)})
              <button
                type="button"
                onClick={() => handleRemove(i)}
                aria-label={`Remove ${skill.name}`}
                className={cn("ml-1.5 rounded text-blue-200 hover:text-white", focusRing)}
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </Badge>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <label htmlFor={nameId} className="sr-only">Skill name</label>
        <input
          ref={nameRef}
          id={nameId}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Skill name"
          className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400"
        />
        <label htmlFor={levelId} className="sr-only">Skill level</label>
        <select
          id={levelId}
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          {SKILL_LEVELS.map((sl) => (
            <option key={sl.value} value={sl.value}>
              {sl.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAdd}
          aria-label="Add skill"
          className={cn("rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700", focusRing)}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </fieldset>
  );
}
