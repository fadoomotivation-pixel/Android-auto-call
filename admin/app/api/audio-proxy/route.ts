import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";

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
    if (data instanceof Blob) {
      buffer = Buffer.from(await data.arrayBuffer());
    } else if (data instanceof ArrayBuffer) {
      buffer = Buffer.from(data);
    } else {
      buffer = Buffer.from(data || "");
    }

    if (!buffer || buffer.length === 0) {
      return new NextResponse("Empty audio data", { status: 404 });
    }

    const isAMR = buffer.length >= 5 && buffer[0] === 0x23 && buffer[1] === 0x21 && buffer[2] === 0x41 && buffer[3] === 0x4d && buffer[4] === 0x52;

    if (isAMR && ffmpegStatic) {
      const stream = new ReadableStream({
        start(controller) {
          const ffmpegPath = ffmpegStatic as string;
          const ffmpeg = spawn(ffmpegPath, [
            "-i", "pipe:0",
            "-f", "mp3",
            "pipe:1"
          ]);

          ffmpeg.stdout.on("data", (chunk: Buffer) => {
            controller.enqueue(chunk);
          });

          ffmpeg.stdout.on("end", () => {
            controller.close();
          });

          ffmpeg.stderr.on("data", (errData: Buffer) => {
          });

          ffmpeg.on("error", (err: Error) => {
            console.error("FFmpeg error:", err);
            controller.error(err);
          });

          ffmpeg.stdin.write(buffer);
          ffmpeg.stdin.end();
        }
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "audio/mp4",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err: any) {
    return new NextResponse(`Proxy Error: ${err?.message || String(err)}`, { status: 500 });
  }
}
