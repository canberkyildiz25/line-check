"use client";

import { useId, useState } from "react";
import { fromUnit, toUnit, type Unit } from "@/lib/units";

/** A length field. Holds inches; shows and accepts the chosen unit. */
export function Length({
  label,
  value,
  unit,
  onChange,
  min = 0,
  max = 600,
  hint,
}: {
  label: string;
  value: number;
  unit: Unit;
  onChange: (inches: number) => void;
  min?: number;
  max?: number;
  hint?: string;
}) {
  const id = useId();
  const shown = round(toUnit(value, unit), unit);
  const [text, setText] = useState(String(shown));
  const [error, setError] = useState<string | null>(null);

  // Follow outside changes (a preset, a unit switch): reset the text when the value moves.
  const [prev, setPrev] = useState(shown);
  if (prev !== shown) {
    setPrev(shown);
    setText(String(shown));
    setError(null);
  }

  const lo = round(toUnit(min, unit), unit);
  const hi = round(toUnit(max, unit), unit);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-box">
        <input
          id={id}
          inputMode="decimal"
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-msg`}
          onChange={(e) => {
            const raw = e.target.value.replace(",", ".");
            setText(e.target.value);
            const n = Number(raw);
            if (raw.trim() === "" || Number.isNaN(n)) {
              setError("Enter a number");
              return;
            }
            if (n < lo || n > hi) {
              setError(`Between ${lo} and ${hi}`);
              return;
            }
            setError(null);
            onChange(fromUnit(n, unit));
          }}
          onBlur={() => {
            if (error) {
              setText(String(shown));
              setError(null);
            }
          }}
        />
        <span className="unit">{unit === "in" ? "in." : "cm"}</span>
      </div>
      <p id={`${id}-msg`} className={error ? "msg is-error" : "msg"}>
        {error ?? hint ?? ""}
      </p>
    </div>
  );
}

const round = (v: number, u: Unit) => (u === "in" ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10);

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-box select">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <p className="msg" />
    </div>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
