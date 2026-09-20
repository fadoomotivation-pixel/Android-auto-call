import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * One conversation, on its own, for the inbox to fetch when a row is clicked.
 *
 * WHY THIS EXISTS
 *
 * Opening a chat was a full page navigation. Every click re-ran the whole
 * screen: the platform-wide activity summary, three hundred lead messages, all
 * 228 conversations, the unknown-numbers list, the copy-paste check, the
 * locked-chat count — and then the one thread actually being asked for. The
 * list scrolled back to the top, the page flashed, and the founder's verdict
 * was the right one: "ek chat khulne me pura page load hota h."
 *
 * The database was never the problem. Measured on the live data: the thread
 * itself is 6ms, the conversation list 11ms. What cost the second and a half
 * was fetching everything else again to render a pane that had not changed.
 *
 * So the list stays mounted and this returns just the thread. Same RPC, same
 * super-admin gate inside it, same short-lived signed URLs — the only thing
 * that changes is how much of the screen has to be rebuilt to read a chat.
 */
export async function GET(req: NextRequest) {
  const rep = req.nextUrl.searchParams.get("rep") ?? "";
  const peer = req.nextUrl.searchParams.get("peer") ?? "";
  if (!rep || !peer) {
    return NextResponse.json({ error: "rep and peer are required" }, { status: 400 });
  }

  const supabase = await createClient();

  // super_rep_peer_thread is security definer and raises 'super admin only'
  // for anyone else, so authorisation lives in one place rather than being
  // re-implemented here and drifting from it.
  const { data, error } = await supabase.rpc("super_rep_peer_thread", {
    p_rep: rep, p_peer: peer, p_limit: 400,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  const rows = (data ?? []) as { media_path: string | null }[];
  const paths = rows.map((r) => r.media_path).filter((p): p is string => Boolean(p));

  const urls: Record<string, string> = {};
  const warnings: string[] = [];
  if (paths.length) {
    // Never discarded. wa-media had no storage policy at all for a while, so
    // every one of these failed silently and the panel blamed the download.
    const { data: signed, error: sErr } = await supabase.storage
      .from("wa-media").createSignedUrls(paths, 3600);
    if (sErr) warnings.push(`attachments could not be opened: ${sErr.message}`);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
      else if (s.error) warnings.push(`attachment ${s.path ?? ""}: ${s.error}`);
    }
  }

  return NextResponse.json(
    { messages: rows, urls, warnings },
    // The signed URLs inside expire in an hour, and a conversation changes
    // whenever the buyer writes. Nothing here may be cached.
    { headers: { "Cache-Control": "no-store" } },
  );
}
