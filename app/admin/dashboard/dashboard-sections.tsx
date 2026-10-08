"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  resolveDashboardLayout,
  toDashboardLayout,
  type DashboardLayout,
  type DashboardSectionId,
  type ResolvedSection,
  type SectionSize,
} from "@/lib/dashboard/layout";

const SIZE_LABELS: Record<SectionSize, string> = { full: "Full width", half: "Half width", third: "Third width" };

function save(sections: ResolvedSection[] | null) {
  void fetch("/api/me/dashboard-layout", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ layout: sections ? toDashboardLayout(sections) : null }),
  }).catch(() => {
    // not saved; the arrangement still applies until the page is reloaded
  });
}

// Each person's own dashboard arrangement (John, 2026-10-08). "Customise
// dashboard" shows a bar on every section: drag ⠿ to move it (or use the
// arrows), pick its width, or hide it. Saved to their account on every change.
export default function DashboardSections({
  sections: content,
  initialLayout,
}: {
  sections: Partial<Record<DashboardSectionId, ReactNode>>;
  initialLayout: DashboardLayout | null;
}) {
  const [sections, setSections] = useState<ResolvedSection[]>(() => resolveDashboardLayout(initialLayout));
  const [customised, setCustomised] = useState(initialLayout !== null);
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<DashboardSectionId | null>(null);
  const [drop, setDrop] = useState<{ id: DashboardSectionId; after: boolean } | null>(null);
  const refs = useRef(new Map<DashboardSectionId, HTMLDivElement>());

  function update(next: ResolvedSection[]) {
    setSections(next);
    setCustomised(true);
    save(next);
  }
  const patch = (id: DashboardSectionId, change: Partial<ResolvedSection>) =>
    update(sections.map((s) => (s.id === id ? { ...s, ...change } : s)));

  function moveTo(id: DashboardSectionId, targetId: DashboardSectionId, after: boolean) {
    if (id === targetId) return;
    const moving = sections.find((s) => s.id === id)!;
    const rest = sections.filter((s) => s.id !== id);
    const at = rest.findIndex((s) => s.id === targetId) + (after ? 1 : 0);
    update([...rest.slice(0, at), moving, ...rest.slice(at)]);
  }
  // The arrows step over hidden sections, which aren't on screen.
  function nudge(id: DashboardSectionId, step: -1 | 1) {
    const visible = sections.filter((s) => !s.hidden);
    const i = visible.findIndex((s) => s.id === id);
    const target = visible[i + step];
    if (target) moveTo(id, target.id, step === 1);
  }

  function reset() {
    setSections(resolveDashboardLayout(null));
    setCustomised(false);
    save(null);
  }

  const hidden = sections.filter((s) => s.hidden);
  const visible = sections.filter((s) => !s.hidden && content[s.id] !== undefined);

  return (
    <>
      <div className="dash-customise-bar">
        {editing ? (
          <>
            <span>
              Drag a section by <strong>⠿</strong> to move it (or use ◀ ▶), choose its width, or hide it. Changes are saved
              to your account as you go.
            </span>
            {customised && (
              <button type="button" className="secondary" onClick={reset}>
                Reset to standard
              </button>
            )}
            <button type="button" onClick={() => setEditing(false)}>
              Done
            </button>
          </>
        ) : (
          <button type="button" className="secondary" onClick={() => setEditing(true)}>
            Customise dashboard
          </button>
        )}
      </div>
      {editing && hidden.length > 0 && (
        <div className="dash-hidden-list">
          Hidden:{" "}
          {hidden.map((s) => (
            <button key={s.id} type="button" className="secondary" onClick={() => patch(s.id, { hidden: false })}>
              Show {s.label}
            </button>
          ))}
        </div>
      )}

      <div className={`dash-layout${editing ? " dash-editing" : ""}`}>
        {visible.map((s, i) => {
          const dropClass = drop?.id === s.id && dragId && dragId !== s.id ? (drop.after ? " dash-drop-after" : " dash-drop-before") : "";
          return (
            <div
              key={s.id}
              ref={(el) => {
                if (el) refs.current.set(s.id, el);
                else refs.current.delete(s.id);
              }}
              className={`dash-section dash-size-${s.size}${dragId === s.id ? " dash-dragging" : ""}${dropClass}`}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                // Full-width sections stack, so above/below; narrower ones sit side by side, so left/right.
                const after = s.size === "full" ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
                if (drop?.id !== s.id || drop.after !== after) setDrop({ id: s.id, after });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && drop) moveTo(dragId, drop.id, drop.after);
                setDragId(null);
                setDrop(null);
              }}
            >
              {editing && (
                <div className="dash-section-bar">
                  <span
                    className="dash-drag-handle"
                    draggable
                    title="Drag to move this section"
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", s.id);
                      const el = refs.current.get(s.id);
                      if (el) e.dataTransfer.setDragImage(el, 20, 20);
                      setDragId(s.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDrop(null);
                    }}
                  >
                    ⠿
                  </span>
                  <strong>{s.label}</strong>
                  <span className="dash-section-tools">
                    <button type="button" className="secondary" title="Move earlier" disabled={i === 0} onClick={() => nudge(s.id, -1)}>
                      ◀
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      title="Move later"
                      disabled={i === visible.length - 1}
                      onClick={() => nudge(s.id, 1)}
                    >
                      ▶
                    </button>
                    <select
                      aria-label={`Width of ${s.label}`}
                      value={s.size}
                      onChange={(e) => patch(s.id, { size: e.target.value as SectionSize })}
                    >
                      {(Object.keys(SIZE_LABELS) as SectionSize[]).map((z) => (
                        <option key={z} value={z}>
                          {SIZE_LABELS[z]}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="secondary" onClick={() => patch(s.id, { hidden: true })}>
                      Hide
                    </button>
                  </span>
                </div>
              )}
              {content[s.id]}
            </div>
          );
        })}
      </div>
    </>
  );
}
