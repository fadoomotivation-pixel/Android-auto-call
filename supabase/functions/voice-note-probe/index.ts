// Retired.
//
// This was a one-off diagnostic used to settle a single question: were the
// 1-2 second voice notes really that short, or was the phone reporting the
// duration wrongly? It read the true length out of each m4a's mvhd atom and
// proved the durations were honest — the recordings genuinely were being cut
// off after about a second and a half, which pointed at the Save button
// sitting exactly where the record button had been.
//
// It is kept as a stub rather than left live because it read storage with the
// service key. If the question ever comes up again, restore it from git
// history rather than pointing anything at this URL.
Deno.serve(() =>
  new Response(
    JSON.stringify({ error: "voice-note-probe was a one-off diagnostic and is retired." }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
