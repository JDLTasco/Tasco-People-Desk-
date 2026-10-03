"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  matchesFilters,
  sortTickets,
  SORT_FIELD_LABELS,
  type DueFilter,
  type SortField,
  type SortKey,
} from "@/lib/tickets/filters";
import { displayStatus } from "@/lib/tickets/action-status";
import type { TicketListRow } from "@/lib/tickets/queries";
import TicketListTable from "./TicketListTable";

function uniqueSorted(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b));
}

interface Option {
  value: string;
  label: string;
}

/** A dropdown of tick boxes -- tick as many as you like (2026-10-03). Closes when you click elsewhere. */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false;
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const summary =
    selected.length === 0
      ? "any"
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;

  return (
    <details ref={ref} className={`multi-select${selected.length > 0 ? " has-selection" : ""}`}>
      <summary>
        {label}: {summary}
      </summary>
      <div className="multi-select-panel">
        {options.map((o) => (
          <label key={o.value}>
            <input
              type="checkbox"
              checked={selected.includes(o.value)}
              onChange={(e) =>
                onChange(e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))
              }
            />{" "}
            {o.label}
          </label>
        ))}
        {options.length === 0 && <em>Nothing to choose</em>}
      </div>
    </details>
  );
}

const SORT_FIELDS = Object.keys(SORT_FIELD_LABELS) as SortField[];
const MAX_SORT_KEYS = 3;

// Client-side filtering over the view's already-scoped ticket set (Pool /
// My Tickets / All Open / Overdue each apply their own fixed status/
// assignment rule server-side, per §13 -- this only narrows what's
// already been returned). Fine at this data volume (a 5-person HR team,
// §3); would need to move server-side if that ever stops being true.
// Filter-matching and sorting logic live in lib/tickets/filters.ts, tested
// independently of this component's state/UI. Since 2026-10-03 status,
// priority, business unit and assignee take several choices each, and the
// list can be sorted by up to three fields in turn.
export default function FilterableTicketList({ tickets }: { tickets: TicketListRow[] }) {
  const [ticketNo, setTicketNo] = useState("");
  const [requester, setRequester] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [priority, setPriority] = useState<string[]>([]);
  const [businessUnit, setBusinessUnit] = useState<string[]>([]);
  const [assignee, setAssignee] = useState<string[]>([]);
  const [due, setDue] = useState<DueFilter>("");
  const [sortKeys, setSortKeys] = useState<SortKey[]>([]);

  const statusOptions = useMemo(
    () => uniqueSorted(tickets.map((t) => displayStatus(t))).map((s) => ({ value: s, label: s })),
    [tickets],
  );
  const priorityOptions = useMemo(
    () => uniqueSorted(tickets.map((t) => t.priority)).map((p) => ({ value: p, label: p })),
    [tickets],
  );
  const businessUnitOptions = useMemo(
    () => [
      { value: "__none__", label: "(none set)" },
      ...uniqueSorted(tickets.map((t) => t.businessUnit?.name)).map((b) => ({ value: b, label: b })),
    ],
    [tickets],
  );
  const assigneeOptions = useMemo(
    () => [
      { value: "__unassigned__", label: "(unassigned)" },
      ...uniqueSorted(tickets.map((t) => (t.assignee ? t.assignee.displayName : undefined))).map((a) => ({ value: a, label: a })),
    ],
    [tickets],
  );

  const filtered = sortTickets(
    tickets.filter((t) => matchesFilters(t, { ticketNo, requester, status, priority, businessUnit, assignee, due })),
    sortKeys,
  );
  const anyFilterActive = Boolean(
    ticketNo || requester || status.length || priority.length || businessUnit.length || assignee.length || due || sortKeys.length,
  );

  function setSortKey(index: number, key: SortKey | null) {
    setSortKeys((prev) => {
      const next = [...prev];
      if (key) next[index] = key;
      else next.splice(index); // clearing a level also clears the levels after it
      return next;
    });
  }

  return (
    <>
      <div className="filter-bar no-print">
        <input
          type="text"
          placeholder="Ticket number..."
          value={ticketNo}
          onChange={(e) => setTicketNo(e.target.value)}
          style={{ width: "9rem" }}
        />
        <input
          type="text"
          placeholder="Requester..."
          value={requester}
          onChange={(e) => setRequester(e.target.value)}
          style={{ width: "10rem" }}
        />
        <MultiSelect label="Status" options={statusOptions} selected={status} onChange={setStatus} />
        <MultiSelect label="Priority" options={priorityOptions} selected={priority} onChange={setPriority} />
        <MultiSelect label="Business unit" options={businessUnitOptions} selected={businessUnit} onChange={setBusinessUnit} />
        <MultiSelect label="Assignee" options={assigneeOptions} selected={assignee} onChange={setAssignee} />
        <select value={due} onChange={(e) => setDue(e.target.value as DueFilter)}>
          <option value="">Due: any</option>
          <option value="OVERDUE">Overdue</option>
          <option value="TODAY">Due today</option>
          <option value="WEEK">Due within 7 days</option>
          <option value="MONTH">Due within 30 days</option>
        </select>
        {anyFilterActive && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setTicketNo("");
              setRequester("");
              setStatus([]);
              setPriority([]);
              setBusinessUnit([]);
              setAssignee([]);
              setDue("");
              setSortKeys([]);
            }}
          >
            Clear filters
          </button>
        )}

        <div className="sort-bar" style={{ flexBasis: "100%", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          {Array.from({ length: Math.min(sortKeys.length + 1, MAX_SORT_KEYS) }, (_, i) => {
            const key = sortKeys[i];
            const usedElsewhere = new Set(sortKeys.filter((_, j) => j !== i).map((k) => k.field));
            return (
              <span key={i}>
                {i === 0 ? "Sort by" : "then by"}{" "}
                <select
                  value={key?.field ?? ""}
                  onChange={(e) =>
                    setSortKey(i, e.target.value ? { field: e.target.value as SortField, direction: key?.direction ?? "asc" } : null)
                  }
                >
                  <option value="">{i === 0 ? "(default order)" : "(nothing)"}</option>
                  {SORT_FIELDS.filter((f) => !usedElsewhere.has(f)).map((f) => (
                    <option key={f} value={f}>
                      {SORT_FIELD_LABELS[f]}
                    </option>
                  ))}
                </select>
                {key && (
                  <select
                    value={key.direction}
                    onChange={(e) => setSortKey(i, { ...key, direction: e.target.value as "asc" | "desc" })}
                    aria-label="Sort direction"
                  >
                    <option value="asc">{key.field === "received" || key.field === "due" ? "oldest / soonest first" : "A to Z / 1 to 3"}</option>
                    <option value="desc">{key.field === "received" || key.field === "due" ? "newest / latest first" : "Z to A / 3 to 1"}</option>
                  </select>
                )}
              </span>
            );
          })}
        </div>
      </div>
      <p className="text-muted">
        {filtered.length} of {tickets.length} ticket{tickets.length === 1 ? "" : "s"}
      </p>
      <TicketListTable tickets={filtered} />
    </>
  );
}
