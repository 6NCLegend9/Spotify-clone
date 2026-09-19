export const metadata = {
  title: "Playlist unavailable",
  description: "This legacy playlist page is no longer available on HayKasa.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PlaylistLayout({ children }) {
  return <>{children}</>;
}
