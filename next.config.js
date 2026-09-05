const isProduction = process.env.NODE_ENV === "production";
const disablePwa =
  process.env.NODE_ENV === "development"
  || process.env.DISABLE_PWA === "1";
const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  "https://www.youtube.com",
];

if (!isProduction) {
  scriptSources.push("'unsafe-eval'");
}

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSources.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://i.ytimg.com https://yt3.ggpht.com https://lh3.googleusercontent.com https://api.dicebear.com https://avatars.githubusercontent.com",
  "font-src 'self' data:",
  "media-src 'self' blob: https://*.googlevideo.com",
  "connect-src 'self' https://www.googleapis.com https://*.youtube.com https://*.googlevideo.com https://*.supabase.co wss://*.supabase.co",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: {
    // Enabled only for production compiles. In `next dev` this flag
    // corrupts HMR module IDs and throws `__webpack_modules__[moduleId] is not a function`.
    webpackMemoryOptimizations: isProduction,
  },
  serverExternalPackages: ["youtubei.js"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "api.dicebear.com" },
    ],
  },
  async headers() {
    return [
      {
        // Strong canonical signal + safe defaults across all routes.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          ...(isProduction
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
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

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: disablePwa,
  cacheStartUrl: false,
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: ({ sameOrigin, url }) =>
          sameOrigin
          && (
            url.pathname.startsWith("/api/")
            || url.pathname === "/api"
            || /^\/(?:login|signup|reset-password|verify-email)(?:\/|$)/.test(
              url.pathname,
            )
          ),
        handler: "NetworkOnly",
      },
      {
        urlPattern: ({ sameOrigin, request }) =>
          sameOrigin
          && ["script", "style", "worker", "font"].includes(request.destination),
        handler: "CacheFirst",
        options: {
          cacheName: "static-resources",
          expiration: {
            maxEntries: 96,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
        },
      },
      {
        // Only same-origin images (incl. /_next/image) are cached. Cross-origin
        // images (YouTube, DiceBear, avatars) pass straight through to the network;
        // intercepting their opaque responses here breaks them in the service worker.
        urlPattern: ({ sameOrigin, request }) =>
          sameOrigin && request.destination === "image",
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "image-resources",
          expiration: {
            maxEntries: 128,
            maxAgeSeconds: 7 * 24 * 60 * 60,
          },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
});

module.exports = withPWA(nextConfig);
