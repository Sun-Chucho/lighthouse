import { redirect } from "next/navigation";

// Keep the former private address useful while removing the MD PIN screen.
export default function DirectorLoginPage() {
  redirect("/md");
}
