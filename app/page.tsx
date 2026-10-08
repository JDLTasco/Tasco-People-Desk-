import { redirect } from "next/navigation";

// The dashboard is the opening screen for everyone (John, 2026-10-08; was
// the Pool, §13's original "default landing view"). A link to a specific
// page still goes straight there after sign-in.
export default function Home() {
  redirect("/admin/dashboard");
}
