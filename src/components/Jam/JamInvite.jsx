import Link from "next/link";
import { loginPath } from "@/utils/appOrigin.mjs";
import { jamPath } from "@/utils/jam.mjs";
import { LISTEN_ON_HEYKASA } from "@/utils/shareCard.mjs";

export default function JamInvite({ code }) {
  return (
    <main className="page mx-auto max-w-xl px-6 py-16 text-white">
      <p className="home-eyebrow">Jam</p>
      <h1 className="home-display mt-3">Jam {code}</h1>
      <p className="home-subtitle">{LISTEN_ON_HEYKASA}</p>
      <p className="mt-6 max-w-md text-sm leading-6 text-[#9aa8b5]">
        Log in to join this live session. Music on HeyKasa stays free, with no ads.
      </p>
      <Link
        href={loginPath(jamPath(code))}
        className="btn-primary mt-8 inline-flex items-center px-6 text-sm font-semibold"
      >
        Log in to join
      </Link>
    </main>
  );
}
