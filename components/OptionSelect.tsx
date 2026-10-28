"use client";

import { useState } from "react";
import { List } from "lucide-react";

const NEW_VALUE = "__new__";

interface OptionSelectProps {
  id: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  label: string; // used for "Select unit" / "New unit" texts
  maxLength?: number;
}

/** A dropdown of known values with an "Add new…" entry that switches to a text box for anything else. */
export default function OptionSelect({ id, value, options, onChange, label, maxLength }: OptionSelectProps) {
  // Start in typing mode only when an existing value isn't one of the options.
  const [typing, setTyping] = useState(() => value !== "" && !options.some((o) => o.toLowerCase() === value.toLowerCase()));
  const noun = label.toLowerCase();

  if (typing) {
    return (
      <div className="flex gap-1">
        <input id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} placeholder={`New ${noun}`} autoFocus={value === ""} />
        <button
          type="button"
          className="btn-secondary shrink-0 px-2.5"
          onClick={() => {
            setTyping(false);
            if (!options.includes(value)) onChange("");
          }}
          aria-label={`Choose ${noun} from the list`}
          title="Choose from the list"
        >
          <List size={15} />
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      className="field"
      value={options.find((o) => o.toLowerCase() === value.toLowerCase()) ?? value}
      onChange={(e) => {
        if (e.target.value === NEW_VALUE) {
          setTyping(true);
          onChange("");
        } else onChange(e.target.value);
      }}
    >
      <option value="">Select {noun}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value={NEW_VALUE}>+ Add new…</option>
    </select>
  );
}
