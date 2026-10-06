"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// The admin screens grouped under one "Admin" drop-down in the nav bar
// (2026-10-03) -- there were enough of them that the bar overflowed and
// pushed Refresh / Dark / Sign out off it for HR Leads and Admins.
// Also used for the Instructions drop-down (2026-10-06) via label/activePrefix.
export default function AdminMenu({
  links,
  label = "Admin",
  activePrefix = "/admin",
}: {
  links: { href: string; label: string }[];
  label?: string;
  activePrefix?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false; // close after navigating
  }, [pathname]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false;
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const active = pathname.startsWith(activePrefix);
  return (
    <details ref={ref} className={`nav-menu${active ? " nav-menu-active" : ""}`}>
      <summary>{label}</summary>
      <div className="nav-menu-panel">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={pathname === l.href ? "current" : undefined}>
            {l.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
