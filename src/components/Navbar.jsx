"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { MdOutlineMenu } from "react-icons/md";
import BrandMark from "./Layout/BrandMark";
import { useNav } from "./Layout/AppShell";
import Searchbar from "./Searchbar";
import UpdatesBell from "./UpdatesBell";

const Navbar = () => {
  const { setShowNav } = useNav();
  const { data: session, status } = useSession();

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-white/5 bg-[#000814]/55 px-3 backdrop-blur-xl sm:px-5">
      <button
        type="button"
        onClick={() => setShowNav(true)}
        className="icon-btn lg:hidden"
        aria-label="Open menu"
      >
        <MdOutlineMenu className="text-xl" />
      </button>

      <BrandMark className="lg:hidden" />

      <div className="mx-auto flex min-w-0 flex-1 justify-center md:mx-0 md:justify-start">
        <Searchbar />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <UpdatesBell />
        {status === "authenticated" ? (
          <Link
            href="/settings"
            aria-label="Open settings"
            title="Open settings"
            className="grid h-10 w-10 place-items-center overflow-hidden rounded-full ring-1 ring-white/20 transition hover:ring-[#00e6e6]"
          >
            <img
              src={session?.user?.image || session?.user?.imageUrl || "/icon-192x192.png"}
              alt=""
              className="h-full w-full object-cover"
            />
          </Link>
        ) : (
          <Link href="/login" className="btn-primary hidden h-10 px-4 text-sm sm:inline-flex">
            Log in
          </Link>
        )}
      </div>
    </header>
  );
};

export default Navbar;
