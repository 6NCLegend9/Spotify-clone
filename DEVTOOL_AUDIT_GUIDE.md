# Localhost DevTool Security & Performance Audit Guide

This guide ensures that local builds of this Next.js 14 App Router codebase handle environment variables, chunks, and data fetching correctly. Specifically, it ensures no server-side secrets (e.g., MongoDB URIs, JWT constants) leak into the client bundle and that DOM structures remain optimized.

## 1. Inspecting the Client Bundle for Secrets

### What to check
It's critical that backend environment variables (defined in your `.env` or `.env.local`) are strictly contained inside Node.js processing and are never exposed via Webpack parsing to the browser window. 

### How to audit using Chrome DevTools
1. Build and start your local Next.js production server:
   ```bash
   npm run build
   npm run start
   ```
2. Open the application at `http://localhost:3000`.
3. Open **Chrome DevTools** (`F12` or `Ctrl+Shift+I`).
4. Go to the **Network** tab and refresh the page.
5. Filter by **JS** (JavaScript files).
6. Select any of the loaded chunk files (e.g. `layout-[hash].js` or `page-[hash].js`).
7. Open the **Search** pane inside DevTools (`Ctrl+Shift+F`) to search across all downloaded resources.
8. Search for exact environment variable names or values:
   - `MONGO_URI`
   - `NEXTAUTH_SECRET`
   - `MONITORED_INBOX`
   - `GMAIL_USER`

**Expected Outcome:** 
You should find **0 results**. If any of these values return a match inside a `.js` chunk, Next.js has accidentally bundled server code into a Client Component (usually triggered by a misplaced `"use client"` directive importing a server utility).

---

## 2. Preventing Webpack Memory Leaks & Module Crashing

### What to check
Since we replaced Google Cloud APIs with local scraping packages (`yt-search`, `cheerio`), we must ensure the Webpack bundler explicitly marks them as external native Node modules so they aren't forced into the DOM (where they would crash).

### How to audit
1. Open your `next.config.js` file.
2. Verify you have the `serverComponentsExternalPackages` correctly mapped to prevent native binding crashes:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['yt-search', 'cheerio'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};
```

**Expected Outcome:**
When you run `npm run build`, there should be zero warnings related to missing native modules (`fs`, `net`, `tls`) or `Attempted import error`.

---

## 3. Auditing Auth Flow & Data Persistence

### What to check
With `AppShell` and GDPR Data Deletion fully integrated, you must verify token validation and data clearance locally.

### How to audit
1. Create a dummy test account using the Signup route.
2. Log into the account.
3. Open DevTools -> **Application** tab -> **Storage** -> **Cookies**.
4. Verify `next-auth.session-token` (or `__Secure-next-auth.session-token`) exists.
5. Go to the **Settings** page and use the Danger Zone deletion form (type `DELETE`).
6. After the toast confirms deletion:
   - Make a final API call to fetch User Info. It should return an empty state or 401 Unauthorized.
   - (Optional) Use MongoDB Compass to verify the document ID was ripped directly out of the `users` and `userdatas` collections.

---

## 4. Accessibility & UI Consistency

### What to check
You must ensure contrast ratios and interactive elements (like the newly updated Delete button) meet accessibility benchmarks.

### How to audit
1. Open DevTools -> **Lighthouse** tab.
2. Select **Accessibility** and run the analysis.
3. Hover your cursor over the newly added Delete Input/Button inside your custom Chrome DevTools element picker.
4. Verify the contrast ratio of the Red Danger button text (`#FFFFFF`) on top of the button background (`#DC2626` / `bg-red-600`) passes the AA minimum threshold (which is ~4.5:1).
