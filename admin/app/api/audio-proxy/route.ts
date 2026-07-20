import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";

// ffmpeg needs the Node runtime (child_process) — not the Edge runtime.
export const runtime = "nodejs";
// Transcoding a call recording can take a few seconds on a cold start; give the
// serverless function headroom (capped by the plan's own limit).
export const maxDuration = 60;

// Pipe an AMR buffer through ffmpeg and resolve with the full MP3 buffer. We
// buffer the whole output (recordings are short) instead of streaming so that a
// transcode failure surfaces as a clean error BEFORE any response headers are
// sent, rather than a truncated/broken audio stream in the browser.
function transcodeAmrToMp3(input: Buffer, ffmpegPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, ["-i", "pipe:0", "-f", "mp3", "pipe:1"]);
    const out: Buffer[] = [];
    let stderr = "";

    ffmpeg.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    ffmpeg.on("error", (err: Error) => reject(err));
    ffmpeg.on("close", (code: number) => {
      if (code === 0 && out.length) {
        resolve(Buffer.concat(out));
      } else {
        reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
      }
    });

    ffmpeg.stdin.on("error", () => {
      /* EPIPE if ffmpeg dies early — the close/error handler reports the reason */
    });
    ffmpeg.stdin.write(input);
    ffmpeg.stdin.end();
  });
}

export async function GET(req: NextRequest) {
  try {
    const callId = req.nextUrl.searchParams.get("callId");
    if (!callId) {
      return new NextResponse("missing callId", { status: 400 });
    }

    const authHeader = req.headers.get("Authorization");

    const supabase = await createClient();

    const { data, error } = await supabase.functions.invoke("recording-url", {
      body: { call_log_id: callId },
      headers: authHeader ? { Authorization: authHeader } : undefined,
    });

    if (error) {
      return new NextResponse(String(error.message || error), { status: 400 });
    }

    let buffer: Buffer;
    let sourceType = "";
    if (data instanceof Blob) {
      sourceType = data.type || "";
      buffer = Buffer.from(await data.arrayBuffer());
    } else if (data instanceof ArrayBuffer) {
      buffer = Buffer.from(data);
    } else {
      buffer = Buffer.from(data || "");
    }

    if (!buffer || buffer.length === 0) {
      return new NextResponse("Empty audio data", { status: 404 });
    }

    // AMR files start with the magic header "#!AMR".
    const isAMR =
      buffer.length >= 5 &&
      buffer[0] === 0x23 &&
      buffer[1] === 0x21 &&
      buffer[2] === 0x41 &&
      buffer[3] === 0x4d &&
      buffer[4] === 0x52;

    if (isAMR) {
      if (!ffmpegStatic) {
        // Never happens once the binary is bundled, but fail loudly rather than
        // handing the browser raw AMR bytes it cannot decode.
        return new NextResponse("Audio transcoder unavailable on server", { status: 501 });
      }
      try {
        const mp3 = await transcodeAmrToMp3(buffer, ffmpegStatic as string);
        return new NextResponse(new Uint8Array(mp3), {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "private, max-age=300",
          },
        });
      } catch (e: any) {
        console.error("AMR transcode failed:", e?.message || e);
        return new NextResponse("Could not transcode recording for playback", { status: 502 });
      }
    }

    // Already a browser-playable format (m4a/wav/mp3…) — pass it through with the
    // real content-type the edge function reported.
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": sourceType || "audio/mp4",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err: any) {
    return new NextResponse(`Proxy Error: ${err?.message || String(err)}`, { status: 500 });
  }
}
