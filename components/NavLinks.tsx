"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

// Phones and tablets (2026-10-03): below 900px the nav links fold away
// behind a ☰ button (see .nav-links in globals.css). On wider screens the
// wrapper is display: contents, so the bar lays out exactly as before.
export default function NavLinks({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]); // close after navigating

  return (
    <>
      <button
        type="button"
        className="nav-icon-btn nav-burger"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "✕" : "☰"} Menu
      </button>
      <div className={`nav-links${open ? " open" : ""}`}>{children}</div>
    </>
  );
}
