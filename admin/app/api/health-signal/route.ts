/**
 * The Health dot in the sidebar asks this. Read-only, admins only.
 * The sidebar is a client component in the shell, so it fetches after paint
 * instead of holding every page on three extra reads.
 */
import { NextResponse } from "next/server";
import { loadDashboardSession } from "@/lib/dashboard/scope";
import { readHealthSignals } from "@/lib/dashboard/healthSignals";

export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase, user, profile, isSuper } = await loadDashboardSession();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (profile?.role !== "admin" && !isSuper) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }
  const summary = await readHealthSignals(supabase);
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}
