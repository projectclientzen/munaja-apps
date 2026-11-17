import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Next.js dev badge sits bottom-left, on top of the demo tools button. Hide it.
  devIndicators: false,
  async headers() {
    // The reset link from CS carries a one-time token in the fragment. Nothing on this page may leak it onward.
    // Defense in depth: the proxy (Nginx/Caddy) should set these too, but the app does not rely on it.
    // geolocation=(self) is needed for the automatic location in onboarding; camera and microphone are never used.
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ];
    return [
      { source: "/:path*", headers: security },
      { source: "/reset", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;
