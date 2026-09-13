"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getUserInfo } from "@/services/dataAPI";
import { MdLogout } from "react-icons/md";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useNav } from "../Layout/AppShell";
import { accountOwner } from "@/utils/accountCache.mjs";
import { loginPath } from "@/utils/appOrigin.mjs";

const AccountProfile = ({ status, data }) => {
  const router = useRouter();
  const { setShowNav } = useNav();
  const [user, setUser] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);
  const rawUserName = data?.user?.name || data?.userName || user?.userName;
  const userName =
    typeof rawUserName === "string" && rawUserName.trim()
      ? rawUserName.trim()
      : "Account";
  const rawUserEmail = data?.user?.email || data?.email || user?.email;
  const userEmail = typeof rawUserEmail === "string" ? rawUserEmail : "";
  const rawImageUrl =
    data?.user?.image || data?.imageUrl || user?.imageUrl || user?.image;
  const imageUrl = typeof rawImageUrl === "string" ? rawImageUrl : "";

  useEffect(() => {
    if (status !== "authenticated") {
      setUser(null);
      return undefined;
    }
    let cancelled = false;
    const fetchUser = async () => {
      const res = await getUserInfo();
      if (!cancelled) setUser(res && typeof res === "object" ? res : null);
    };
    void fetchUser();
    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  const close = () => setShowNav(false);

  if (status === "loading") {
    return (
      <div className="flex h-16 items-center px-2">
        <span className="loading" role="status" aria-label="Loading account" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/login"
          prefetch
          onClick={(event) => {
            close();
            const next = loginPath(window.location.href, window.location.origin);
            if (next !== "/login") {
              event.preventDefault();
              router.push(next);
            }
          }}
          className="btn-ghost h-10 text-sm"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          prefetch
          onClick={close}
          className="btn-primary h-10 text-sm"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="glass-panel flex items-center gap-3 rounded-xl p-2.5">
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
            {userName.charAt(0).toUpperCase()}
          </span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-white">{userName}</p>
          <button
            type="button"
            aria-label="Log out"
            onClick={() => {
              close();
              void signOut();
            }}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-[#00e6e6]"
          >
            <MdLogout size={18} />
          </button>
        </div>
        {userEmail ? (
          <p className="truncate text-[11px] text-[#9aa8b5]">{userEmail}</p>
        ) : null}
      </div>
    </div>
  );
};

const Profile = () => {
  const { status, data } = useSession();
  return <AccountProfile key={accountOwner(data, status) || status} status={status} data={data} />;
};

export default Profile;
