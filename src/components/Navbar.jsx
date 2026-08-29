"use client";
import React from "react";
import logo from "../assets/hayasaka.png";
import Image from "next/image";
import Searchbar from "./Searchbar";
import UpdatesBell from "./UpdatesBell";
import Link from "next/link";
import { useDispatch } from "react-redux";
import { setProgress } from "@/redux/features/loadingBarSlice";
import { MdOutlineMenu } from "react-icons/md";
import { IoClose } from "react-icons/io5";
import Sidebar from "./Sidebar/Sidebar";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

const Navbar = () => {
  const dispatch = useDispatch();
  const [showNav, setShowNav] = React.useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const [contentFilter, setContentFilter] = React.useState("All");
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const navigation = status === "authenticated"
    ? [
        ["Home", "/"],
        // ["Search", "/search/music"],
        ["Your Library", "/library"],
        ["Settings", "/settings"],
      ]
    : [
        ["Home", "/"],
        // ["Search", "/search/music"],
        ["Your Library", "/library"],
        ["Explore", "/search/discover"],
        ["Log In / Sign Up", "/login"],
      ];
  return (
    <>
      <div className="bg-[#020813] h-[70px] text-white flex justify-between relative items-center overflow-visible">
        <div className=" flex">
          <MdOutlineMenu
            onClick={() => setShowNav(true)}
            className=" mx-4 text-2xl lg:text-3xl my-auto cursor-pointer"
          />
          <div
            className={`flex justify-center items-center transition-all duration-300 ${mobileSearchOpen ? "opacity-0 pointer-events-none w-0 overflow-hidden md:opacity-100 md:pointer-events-auto md:w-auto md:overflow-visible" : "opacity-100"}`}
          >
            <Link href="/">
              <Image
                onClick={() => {
                  dispatch(setProgress(100));
                }}
                src={logo}
                alt="logo"
                className=" lg:py-2  aspect-video w-[135px] h-[30.741px] lg:h-[58px] lg:w-[190px]"
              />
            </Link>
          </div>
        </div>
        <nav className="hidden items-center gap-4 px-4 text-xs text-gray-300 lg:flex" aria-label="Primary navigation">
          {navigation.map(([label, href]) => (
            <Link key={label} href={href} aria-current={pathname === href || (href !== "/" && pathname.startsWith(href)) ? "page" : undefined} className={`transition hover:text-[#00e6e6] ${pathname === href || (href !== "/" && pathname.startsWith(href)) ? "font-semibold text-[#00e6e6]" : ""}`}>
              {label}
            </Link>
          ))}
          {status === "authenticated" ? (
            <Link href="/settings" aria-label="Open settings" title="Open settings" className="rounded-full ring-1 ring-white/20 transition hover:ring-[#00e6e6]">
              <img
                src={session?.user?.image || session?.user?.imageUrl || "/icon-192x192.png"}
                alt="Open settings"
                className="h-9 w-9 rounded-full object-cover"
              />
            </Link>
          ) : (
            <Link href="/settings" className="transition hover:text-[#00e6e6]">
              Settings
            </Link>
          )}
          {/* {status === "authenticated" && (
            <div className="ml-2 flex items-center gap-1 border-l border-white/10 pl-3" aria-label="Content filters">
              {["All", "Music", "Podcasts", "Audiobooks", "Music Videos"].map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setContentFilter(filter)}
                  className={`rounded-full px-2.5 py-1 text-[11px] transition ${contentFilter === filter ? "bg-[#00e6e6] text-black" : "text-gray-400 hover:bg-white/10 hover:text-white"}`}
                >
                  {filter}
                </button>
              ))}
            </div>
          )} */}
        </nav>
        <div className="relative flex items-center justify-end">
          <Searchbar
            mobileSearchOpen={mobileSearchOpen}
            setMobileSearchOpen={setMobileSearchOpen}
          />
          <UpdatesBell mobileSearchOpen={mobileSearchOpen} />
        </div>
      </div>

      <Sidebar showNav={showNav} setShowNav={setShowNav} />
      {/* overlay */}
      <div
        onClick={() => setShowNav(false)}
        className={`fixed top-0 left-0 z-30 h-screen w-screen bg-black/50 transition-opacity duration-300 ${showNav ? "opacity-100" : "pointer-events-none opacity-0"}`}
      ></div>
      <div
        onClick={() => setShowNav(false)}
        className={`md:hidden fixed top-7 right-10 z-50 text-3xl text-white transition-all duration-300 ${showNav ? "opacity-100 rotate-0" : "pointer-events-none opacity-0 rotate-90"}`}
      >
        <IoClose />
      </div>
    </>
  );
};

export default Navbar;
