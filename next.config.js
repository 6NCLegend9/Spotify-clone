const isProduction = process.env.NODE_ENV === "production";
const disablePwa =
  process.env.NODE_ENV === "development"
  || process.env.DISABLE_PWA === "1";
const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  "https://www.youtube.com",
];
const discordBridgeSources = isProduction
  ? []
  : ["ws://127.0.0.1:64650"];

if (!isProduction) {
  scriptSources.push("'unsafe-eval'");
}

// The loopback Discord bridge is a development-only migration aid. Production
// browsers use the native Electron boundary instead and must not receive a
// loopback WebSocket allowance. Do not add `upgrade-insecure-requests` in
// development because the local bridge intentionally does not terminate TLS.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSources.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: heykasa-media: https://i.ytimg.com https://yt3.ggpht.com https://lh3.googleusercontent.com https://api.dicebear.com https://avatars.githubusercontent.com https://images.unsplash.com",
  "font-src 'self' data:",
  "media-src 'self' blob: https://*.googlevideo.com",
  `connect-src 'self' https://www.googleapis.com https://*.youtube.com https://*.googlevideo.com https://*.supabase.co wss://*.supabase.co ${discordBridgeSources.join(" ")}`,
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function securityHeaders({ allowFraming = false } = {}) {
  const csp = allowFraming
    ? `${contentSecurityPolicy}; frame-ancestors *`
    : `${contentSecurityPolicy}; frame-ancestors 'self'`;
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    ...(allowFraming ? [] : [{ key: "X-Frame-Options", value: "SAMEORIGIN" }]),
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), loopback-network=(self), compute-pressure=()",
    },
    { key: "Content-Security-Policy", value: csp },
    ...(isProduction
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ]
      : []),
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  poweredByHeader: false,
  turbopack: {
    resolveAlias: {
      module: { browser: "./src/utils/browserNodeStub.js" },
      fs: { browser: "./src/utils/browserNodeStub.js" },
      path: { browser: "./src/utils/browserNodeStub.js" },
      events: { browser: "events/" },
      "./taglib-web.wasm": "./node_modules/taglib-wasm/dist/taglib-web.wasm",
    },
  },
  experimental: {
    // Enabled only for production compiles. In `next dev` this flag
    // corrupts HMR module IDs and throws `__webpack_modules__[moduleId] is not a function`.
    webpackMemoryOptimizations: isProduction,
    optimizePackageImports: ["react-icons", "lucide-react"],
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  serverExternalPackages: ["youtubei.js"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "api.dicebear.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [
          ...securityHeaders({ allowFraming: true }),
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        // Embed routes set x-kasa-embed in middleware so they keep frame-ancestors *.
        // Avoid regex lookarounds here; Vercel compiles these sources with path-to-regexp.
        source: "/:path*",
        missing: [{ type: "header", key: "x-kasa-embed" }],
        headers: securityHeaders(),
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        source: "/verify-email/:token",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/reset-password/:token",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/sitemap.xml",
        headers: [
          { key: "Content-Type", value: "application/xml" },
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=3600",
          },
        ],
      },
      {
        source: "/robots.txt",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=3600",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/genres",
        destination: "/settings",
        permanent: true,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "./taglib-web.wasm$": require("path").resolve(
        __dirname,
        "node_modules/taglib-wasm/dist/taglib-web.wasm",
      ),
    };

    // Handle taglib-wasm browser build
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        module: false,
        fs: false,
        path: false,
        events: require.resolve("events/"),
      };
    }
    return config;
  },
};

const withSerwist = require("@serwist/next").default({
  swSrc: "src/sw.js",
  swDest: "public/sw.js",
  register: true,
  disable: disablePwa,
});

const withBundleAnalyzer = process.env.ANALYZE === "true" ? require("@next/bundle-analyzer")({
  enabled: true,
  openAnalyzer: false,
}) : (config) => config;

module.exports = withBundleAnalyzer(withSerwist(nextConfig));
