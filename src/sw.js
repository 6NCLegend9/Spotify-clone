/* global self */
import {
  CacheFirst,
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

const PRIVATE_ROUTE = /^\/(?:login|signup|resend-verification|reset-password|verify-email)(?:\/|$)/;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
  },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching: [
    {
      matcher: ({ sameOrigin, url }) => (
        sameOrigin
        && (
          url.pathname === "/api"
          || url.pathname.startsWith("/api/")
          || PRIVATE_ROUTE.test(url.pathname)
        )
      ),
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ sameOrigin, request }) => (
        sameOrigin
        && ["script", "style", "worker", "font"].includes(request.destination)
      ),
      handler: new CacheFirst({
        cacheName: "static-resources",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 96,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    {
      // Keep cross-origin images out of the service worker. YouTube thumbnails
      // and avatar CDNs can return opaque responses; caching them here caused
      // stale/broken media in the previous worker.
      matcher: ({ sameOrigin, request }) => sameOrigin && request.destination === "image",
      handler: new StaleWhileRevalidate({
        cacheName: "image-resources",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 128,
            maxAgeSeconds: 7 * 24 * 60 * 60,
          }),
          new CacheableResponsePlugin({
            statuses: [0, 200],
          }),
        ],
      }),
    },
  ],
});

serwist.addEventListeners();
