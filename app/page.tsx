import { redirect } from "next/navigation";

// §13: Pool is "the default landing view."
export default function Home() {
  redirect("/pool");
}
