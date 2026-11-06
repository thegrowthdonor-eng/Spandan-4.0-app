import Link from "next/link";
import { redirect } from "next/navigation";
import { createRequestClient } from "@/server/supabase/server";
import { getManagementSummary } from "@/server/management";
import { canEnterManagement } from "@/lib/management";
import { WorkspaceShell } from "@/components/admin/workspace-shell";
import "./portal.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) redirect("/account?next=/admin");
  const summary = await getManagementSummary();
  if (!summary) return <main className="portal-unavailable"><h1>Workspace temporarily unavailable</h1><p>We could not load your organiser access. Refresh to try again.</p><Link href="/my-fest">Return to My Fest</Link></main>;
  if (!canEnterManagement(summary)) return <main className="portal-unavailable"><h1>Management access unavailable</h1><p>Your account has no active organiser responsibility.</p><Link href="/my-fest">Return to My Fest</Link></main>;
  return <WorkspaceShell summary={summary}>{children}</WorkspaceShell>;
}
