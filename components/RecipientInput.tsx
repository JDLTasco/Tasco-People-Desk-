"use client";

import { useEffect, useRef, useState } from "react";

interface Suggestion {
  email: string;
  name: string | null;
}

/**
 * A comma-separated address box that suggests addresses the People Desk has
 * already seen (John, 2026-10-03 -- see lib/address-book.ts). Type part of a
 * name or address; pick with the mouse, or arrow keys + Enter/Tab. The value
 * stays a plain "a@x.com, b@y.com" string, so callers parse it exactly as before.
 */
export default function RecipientInput({
  value,
  onChange,
  placeholder,
  width = "20rem",
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  width?: string;
  ariaLabel?: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // The address being typed is whatever follows the last comma/semicolon.
  const parts = value.split(/[,;]/);
  const current = parts[parts.length - 1].trim();

  useEffect(() => {
    if (current.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/address-book?q=${encodeURIComponent(current)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((d: { suggestions?: Suggestion[] }) => {
          const already = new Set(parts.slice(0, -1).map((p) => p.trim().toLowerCase()));
          setSuggestions((d.suggestions ?? []).filter((s) => !already.has(s.email) && s.email !== current.toLowerCase()));
          setHighlight(0);
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // parts is derived from value; current captures what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function pick(s: Suggestion) {
    const kept = parts.slice(0, -1).map((p) => p.trim()).filter(Boolean);
    onChange([...kept, s.email].join(", ") + ", ");
    setSuggestions([]);
  }

  const showList = open && suggestions.length > 0;

  return (
    <span ref={wrapRef} className="recipient-input" style={{ width }}>
      <input
        value={value}
        aria-label={ariaLabel}
        placeholder={placeholder}
        autoComplete="off"
        style={{ width: "100%" }}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            pick(suggestions[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {showList && (
        <ul className="recipient-suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.email}
              role="option"
              aria-selected={i === highlight}
              className={i === highlight ? "active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              {s.name ? (
                <>
                  <strong>{s.name}</strong> <span className="text-muted">{s.email}</span>
                </>
              ) : (
                s.email
              )}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
