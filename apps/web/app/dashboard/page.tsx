import { redirect } from "next/navigation";

// The book library is the real home base now -- keep this route around as a
// friendly redirect in case anything still links to /dashboard.
export default function DashboardRedirect() {
  redirect("/library");
}
