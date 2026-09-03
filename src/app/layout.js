import { Poppins } from "next/font/google";
import "./globals.css";
import SongsHistory from "@/components/SongsHistory";
import SettingsSync from "@/components/SettingsSync";
import LanguageSync from "@/components/LanguageSync";
import Providers from "@/redux/Providers";
import TopProgressBar from "@/components/topProgressBar/TopProgressBar";
import Favicon from "./favicon.ico";
import AuthProvider from "./AuthProvider";
import AppShell from "@/components/Layout/AppShell";
import { AccessibilityPreferencesProvider } from "@/components/AccessibilityPreferences";
import AnalyticsConsent from "@/components/AnalyticsConsent";
import {
  SITE_URL,
  SITE_NAME,
  SITE_TAGLINE,
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  DEFAULT_KEYWORDS,
  OG_IMAGE,
  TWITTER_HANDLE,
  absoluteUrl,
} from "@/utils/siteConfig";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  generator: "Next.js",
  keywords: DEFAULT_KEYWORDS,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "music",
  classification: "Music Streaming",
  referrer: "origin-when-cross-origin",
  verification: {
    google: "xKWFwcLg7uqtQGOTNIKraZ8uxuWF9Jxa_By43QL3678",
  },
  icons: [
    { rel: "icon", url: Favicon.src },
    { rel: "apple-touch-icon", url: "/icon-192x192.png" },
  ],
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE,
        width: 512,
        height: 512,
        alt: `${SITE_NAME} - ${SITE_TAGLINE}`,
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: TWITTER_HANDLE,
    creator: TWITTER_HANDLE,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
    languages: {
      "en-US": SITE_URL,
      "x-default": SITE_URL,
    },
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": SITE_NAME,
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#000000",
    "msapplication-TileImage": "/icon-256x256.png",
    "theme-color": "#000000",
  },
};

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

export const viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      alternateName: ["HeyKasa Music", "HeyKasa App"],
      description: DEFAULT_DESCRIPTION,
      inLanguage: "en-US",
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: [
        {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}/search/{search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      ],
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      legalName: "HeyKasa Music",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        "@id": `${SITE_URL}/#logo`,
        url: absoluteUrl(OG_IMAGE),
        width: 512,
        height: 512,
        caption: SITE_NAME,
      },
      image: { "@id": `${SITE_URL}/#logo` },
      foundingDate: "2023",
      slogan: SITE_TAGLINE,
      sameAs: ["https://github.com/6NCLegend9"],
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#webapp`,
      name: SITE_NAME,
      alternateName: "HeyKasa Music",
      description: DEFAULT_DESCRIPTION,
      url: SITE_URL,
      applicationCategory: "MusicApplication",
      applicationSubCategory: "Music Streaming",
      operatingSystem: "Web, Android, iOS, Windows, macOS, Linux",
      browserRequirements: "Requires JavaScript and a modern browser.",
      isAccessibleForFree: true,
      inLanguage: "en",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
      featureList: [
        "Free unlimited music streaming",
        "MP3 song download",
        "Custom playlist creation",
        "Favorite songs library",
        "Lyrics and album art",
        "English music",
        "Offline ready PWA",
        "Ad-light listening experience",
      ],
      screenshot: absoluteUrl(OG_IMAGE),
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "Is HeyKasa free to use?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. HeyKasa is completely free. You can stream and download music, build playlists, and follow artists without paying anything.",
          },
        },
        {
          "@type": "Question",
          name: "Do I need to sign up to listen on HeyKasa?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "You can stream music on HeyKasa without an account. Sign up only if you want to save favorites and create personal playlists synced across devices.",
          },
        },
        {
          "@type": "Question",
          name: "What music is available on HeyKasa?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "HeyKasa offers English music, including popular and indie tracks.",
          },
        },
        {
          "@type": "Question",
          name: "Can I download MP3 songs from HeyKasa?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Each track on HeyKasa offers a download option so you can save songs in MP3 format for offline listening.",
          },
        },
      ],
    },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={poppins.variable} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={poppins.className}>
        <nav className="skip-links" aria-label="Skip links">
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <a href="#player" className="skip-link">
            Skip to player
          </a>
        </nav>
        <AccessibilityPreferencesProvider>
          <Providers>
            <AuthProvider>
              <AnalyticsConsent />
              <TopProgressBar />
              <SongsHistory />
              <SettingsSync />
              <LanguageSync />
              <AppShell>{children}</AppShell>
            </AuthProvider>
          </Providers>
        </AccessibilityPreferencesProvider>
      </body>
    </html>
  );
}
