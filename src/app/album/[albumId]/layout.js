export const metadata = {
  title: "Album unavailable",
  description: "This legacy album page is no longer available on HayKasa.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AlbumLayout({ children }) {
  return <>{children}</>;
}
