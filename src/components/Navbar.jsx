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
    <header className="app-navbar">
      <button
        type="button"
        onClick={() => setShowNav(true)}
        className="icon-btn h-9 w-9 shrink-0 lg:hidden"
        aria-label="Open menu"
      >
        <MdOutlineMenu className="text-xl" />
      </button>

      <BrandMark className="hidden shrink-0 sm:flex lg:hidden" />

      <div className="min-w-0 flex-1">
        <Searchbar />
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
        <UpdatesBell />
        {status === "authenticated" ? (
          <Link
            href="/settings"
            aria-label="Open settings"
            title="Open settings"
            className="grid h-8 w-8 place-items-center overflow-hidden rounded-full ring-1 ring-white/20 transition hover:ring-[#00e6e6] sm:h-10 sm:w-10"
          >
            <img
              src={session?.user?.image || session?.user?.imageUrl || "/icon-192x192.png"}
              alt=""
              className="h-full w-full object-cover"
            />
          </Link>
        ) : (
          <Link href="/login" className="btn-primary h-8 px-2.5 text-xs sm:h-10 sm:px-4 sm:text-sm">
            Log in
          </Link>
        )}
      </div>
    </header>
  );
};

export default Navbar;
