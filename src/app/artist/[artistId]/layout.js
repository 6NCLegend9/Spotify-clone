export const metadata = {
  title: "Artist unavailable",
  description: "This legacy artist page is no longer available on HeyKasa.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ArtistLayout({ children }) {
  return <>{children}</>;
}
