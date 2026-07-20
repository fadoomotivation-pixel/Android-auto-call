/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // ffmpeg-static ships a native binary whose path is resolved at runtime via
    // __dirname. Marking it external keeps it in node_modules (not webpack-
    // bundled) so its path resolves at runtime...
    serverComponentsExternalPackages: ["ffmpeg-static"],
    // ...but Node File Trace only follows code it can see statically, and the
    // ffmpeg binary is referenced only as a runtime path string — so it was
    // dropped from the serverless bundle (spawn … ENOENT). Explicitly include
    // the binary in the audio-proxy function's trace so it ships to Vercel.
    outputFileTracingIncludes: {
      "/api/audio-proxy": ["./node_modules/ffmpeg-static/ffmpeg"],
    },
  },
};

export default nextConfig;
