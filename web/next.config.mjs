// Plain ESM (not next.config.ts): loading a TypeScript config needs the native
// SWC binary, which cannot run on Hostinger's build server (old glibc).
// Allow next/image to optimise posters and logos served from Supabase Storage.
// The hostname comes from the public Supabase URL so it works for any project.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
/** @type {NonNullable<import("next").NextConfig["images"]>["remotePatterns"]} */
const remotePatterns = [
  { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
  { protocol: "http", hostname: "127.0.0.1", port: "54321", pathname: "/storage/v1/object/public/**" },
  { protocol: "http", hostname: "localhost", port: "54321", pathname: "/storage/v1/object/public/**" },
];
if (supabaseUrl) {
  try {
    const u = new URL(supabaseUrl);
    remotePatterns.push({
      protocol: /** @type {"http" | "https"} */ (u.protocol.replace(":", "")),
      hostname: u.hostname,
      port: u.port || undefined,
      pathname: "/storage/v1/object/public/**",
    });
  } catch {
    // ignore malformed URL; the app will report the env problem at runtime
  }
}

// Server Actions compare the browser's Origin with the host the server sees.
// Behind Hostinger's proxy those can differ, so the public site host is allowed explicitly.
/** @type {string[]} */
const allowedOrigins = [];
try {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) allowedOrigins.push(new URL(site).host);
} catch {
  // ignore malformed URL
}

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Cache Components is intentionally OFF: almost every TickLO page reads the
  // Supabase session cookie, so classic dynamic rendering is simpler and safer.
  // See DECISIONS.md (D-003).
  poweredByHeader: false,
  images: {
    remotePatterns,
    formats: ["image/webp"],
  },
  experimental: {
    // proxy.ts buffers request bodies (default 10 MB); uploads can be ~10 MB.
    proxyClientMaxBodySize: "12mb",
    serverActions: {
      allowedOrigins,
      // Payment screenshot (5 MB) + student card photo (5 MB) + form overhead.
      bodySizeLimit: "11mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Camera is needed by the web scanner (/scan) on our own origin only.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
