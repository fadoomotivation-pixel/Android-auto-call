"use client";

/**
 * "Demo data" on every screen that shows the demo company.
 *
 * Lives in the shell, not in each page, so a page opened from the demo with
 * `?company=<demo>` can never forget to say it. A founder showing the product
 * must never be able to mistake the example for a real customer, and neither
 * must the person watching.
 */
import { usePathname, useSearchParams } from "next/navigation";
import { DEMO_COMPANY_ID } from "@/lib/dashboard/demo";

export function DemoBanner() {
  const path = usePathname();
  const company = useSearchParams().get("company");
  if (company !== DEMO_COMPANY_ID && !path.startsWith("/dashboard/demo")) return null;
  return (
    <div className="demo-banner" role="note">
      <span className="demo-pill">Demo data</span>
      <span>Sunrise Infra is a made-up builder. Every name, number and call here is an example. No real buyer is in it.</span>
    </div>
  );
}
