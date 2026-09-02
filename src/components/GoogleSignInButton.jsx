"use client";

import { useEffect, useState } from "react";
import { getProviders } from "next-auth/react";
import { FaGoogle } from "react-icons/fa";

export default function GoogleSignInButton({
  busy,
  disabled,
  onClick,
}) {
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    let active = true;

    getProviders()
      .then((providers) => {
        if (active) setIsAvailable(Boolean(providers?.google));
      })
      .catch(() => {
        if (active) setIsAvailable(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (!isAvailable) return null;

  return (
    <>
      <div className="flex items-center gap-3 text-xs text-[#9aa8b5]">
        <span className="h-px flex-1 bg-white/15" />
        or
        <span className="h-px flex-1 bg-white/15" />
      </div>
      <button
        onClick={onClick}
        type="button"
        disabled={disabled || busy}
        className="btn-ghost w-full"
      >
        <FaGoogle />
        {busy ? "Opening Google..." : "Continue with Google"}
      </button>
    </>
  );
}
