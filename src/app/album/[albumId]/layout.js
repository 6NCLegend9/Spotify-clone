export const metadata = {
  title: "Album unavailable",
  description: "This legacy album page is no longer available on HeyKasa.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AlbumLayout({ children }) {
  return <>{children}</>;
}
