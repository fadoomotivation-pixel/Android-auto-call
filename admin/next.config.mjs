/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // ffmpeg-static ships a native binary whose path is resolved at runtime via
    // __dirname. Without this, Vercel/webpack bundles the JS but drops the
    // binary, so the audio-proxy route crashes (ENOENT) in production. Marking
    // it external keeps it in node_modules where Node File Trace can find and
    // bundle the binary with the serverless function.
    serverComponentsExternalPackages: ["ffmpeg-static"],
  },
};

export default nextConfig;
