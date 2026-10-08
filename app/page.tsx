import { redirect } from "next/navigation";

// The dashboard is the opening screen for everyone (John, 2026-10-08; was
// the Pool, §13's original "default landing view"). After signing in,
// everyone lands here too, except from a link to one ticket -- see
// afterSignIn() in app/sign-in/page.tsx.
export default function Home() {
  redirect("/admin/dashboard");
}
