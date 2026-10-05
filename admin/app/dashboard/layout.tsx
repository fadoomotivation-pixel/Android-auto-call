import { Suspense } from "react";
import { redirect } from "next/navigation";
import { loadDashboardSession } from "@/lib/dashboard/scope";
import { Chrome } from "./Chrome";
import { CaptureOutageBanner, CaptureOutagePending } from "./CaptureOutageBanner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // One cached identity for the sidebar and whichever page is opening.
  // The capture check is slower and must not hold the chrome or the page.
  const { user, profile, company, isSuper } = await loadDashboardSession();
  if (!user) redirect("/login");

  return (
    <Chrome profile={profile} company={company} email={user.email} isSuper={isSuper}>
      {/* The only capture-outage mount. It sits in the shell, under the top
          bar and above the page, so a page cannot render a second copy.
          Suspense keeps a slow session read from blocking the route. */}
      {(profile?.role === "admin" || isSuper) && (
        <Suspense fallback={<CaptureOutagePending />}>
          <CaptureOutageBanner />
        </Suspense>
      )}
      <main className="main">{children}</main>
    </Chrome>
  );
}
