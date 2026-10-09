"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { normalizeKey } from "@/lib/normalize";

/** Valores distintos (ya existentes) de una columna de inventory, ordenados. */
export function useDistinctValues(column: "marca" | "supplier"): string[] {
  const [values, setValues] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createBrowserClient();
      const found = new Set<string>();
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("inventory")
          .select(column)
          .not(column, "is", null)
          .range(from, from + pageSize - 1);
        if (error || !data) break;
        for (const row of data as unknown as Record<string, string | null>[]) {
          const v = row[column]?.trim();
          if (v) found.add(v);
        }
        if (data.length < pageSize) break;
      }
      if (!cancelled) {
        setValues([...found].sort((a, b) => a.localeCompare(b, "es")));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [column]);

  return values;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  /** Texto del aviso cuando lo escrito no existe todavía. */
  newLabel?: string;
};

export default function SuggestInput({
  value,
  onChange,
  options,
  placeholder,
  newLabel = "Nuevo",
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const key = normalizeKey(value);
  const exact = useMemo(
    () => options.find((o) => normalizeKey(o) === key),
    [options, key]
  );

  const suggestions = useMemo(() => {
    if (!key) return options.slice(0, 8);
    const starts: string[] = [];
    const contains: string[] = [];
    for (const o of options) {
      const k = normalizeKey(o);
      if (k.startsWith(key)) starts.push(o);
      else if (k.includes(key)) contains.push(o);
    }
    return [...starts, ...contains].slice(0, 8);
  }, [options, key]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function pick(option: string) {
    onChange(option);
    setOpen(false);
    setActive(-1);
  }

  // Al salir del campo: si coincide con una marca existente, usa EXACTAMENTE
  // esa escritura; si es nueva, la deja en MAYÚSCULAS (convención de la base).
  function snap() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onChange(exact ?? trimmed.toUpperCase());
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && active >= 0 && suggestions[active]) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const isNew = value.trim() !== "" && !exact;

  return (
    <div ref={wrapperRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={snap}
        onKeyDown={onKeyDown}
        className="input"
        placeholder={placeholder}
        autoComplete="off"
      />

      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-[#1a1a1f] p-1 shadow-xl">
          {suggestions.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                // mousedown (no click) para ganarle al blur del input
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  i === active
                    ? "bg-[#E0457B]/20 text-white"
                    : "text-white/80 hover:bg-white/10"
                }`}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      {isNew && (
        <p className="mt-1 text-xs text-yellow-400/80">
          {newLabel}: no existe en el inventario todavía
        </p>
      )}
    </div>
  );
}
