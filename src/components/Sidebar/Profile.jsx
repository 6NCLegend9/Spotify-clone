"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getUserInfo } from "@/services/dataAPI";
import { MdLogout } from "react-icons/md";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useNav } from "../Layout/AppShell";

const Profile = () => {
  const router = useRouter();
  const { setShowNav } = useNav();
  const { status, data } = useSession();
  const [user, setUser] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);
  const userName = data?.user?.name || data?.userName || user?.userName || "Account";
  const userEmail = data?.user?.email || data?.email || user?.email;
  const imageUrl = data?.user?.image || data?.imageUrl || user?.imageUrl || user?.image;

  useEffect(() => {
    const fetchUser = async () => {
      const res = await getUserInfo();
      setUser(res);
    };
    fetchUser();
  }, [status]);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  const close = () => setShowNav(false);

  if (status === "loading") {
    return (
      <div className="flex h-16 items-center px-2">
        <span className="loading" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            close();
            router.push("/login");
          }}
          className="btn-ghost h-10 text-sm"
        >
          Log in
        </button>
        <button
          type="button"
          onClick={() => {
            close();
            router.push("/signup");
          }}
          className="btn-primary h-10 text-sm"
        >
          Sign up
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-2.5">
      <Link
        href="/settings"
        onClick={close}
        aria-label="Open settings"
        title="Open settings"
        className="shrink-0"
      >
        {imageUrl && !imageFailed ? (
          <img
            src={imageUrl}
            alt=""
            onError={() => setImageFailed(true)}
            className="h-11 w-11 rounded-full object-cover ring-1 ring-white/20 transition hover:ring-[#00e6e6]"
          />
        ) : (
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#00e6e6] text-base font-semibold text-black">
            {userName.trim().charAt(0).toUpperCase()}
          </span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="truncate text-sm font-semibold text-white">{userName}</h1>
          <button
            type="button"
            aria-label="Log out"
            onClick={() => {
              close();
              signOut();
            }}
            className="text-white/80 transition hover:text-[#00e6e6]"
          >
            <MdLogout size={18} />
          </button>
        </div>
        <p className="truncate text-[11px] text-[#9aa8b5]">{userEmail}</p>
      </div>
    </div>
  );
};

export default Profile;
