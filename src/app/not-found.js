import Link from "next/link";
import NotFoundPlaybackGuard from "@/components/Layout/NotFoundPlaybackGuard";
import { SITE_URL, SITE_NAME } from "@/utils/siteConfig";

export const metadata = {
  title: "Page Not Found",
  description: `The page you are looking for does not exist on ${SITE_NAME}. Head back to the home page and keep listening.`,
  alternates: { canonical: `${SITE_URL}/` },
  robots: { index: false, follow: true },
};

const NotFound = () => {
  return (
    <>
      <NotFoundPlaybackGuard />
      <div className="page grid min-h-full place-items-center text-center text-white">
      <div>
        <p className="eyebrow">Error</p>
        <h1 className="mt-2 text-8xl font-black text-[#00e6e6]">404</h1>
        <h2 className="mt-3 text-2xl font-bold">Page not found</h2>
        <p className="mx-auto mt-3 max-w-md text-[#9aa8b5]">
          The page you are looking for moved, renamed, or never existed on{" "}
          {SITE_NAME}.
        </p>
        <Link href="/" className="btn-primary mt-6">
          Back to Home
        </Link>
      </div>
      </div>
    </>
  );
};

export default NotFound;
