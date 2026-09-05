"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useJam } from "@/components/Jam/JamProvider";
import { requestJamOpen } from "@/utils/jam.mjs";

export default function JamJoinClient({ code }) {
  const router = useRouter();
  const jam = useJam();
  const jamRef = useRef(jam);
  const joiningRef = useRef(false);
  jamRef.current = jam;

  useEffect(() => {
    if (joiningRef.current) return;
    const current = jamRef.current;
    if (!current?.available) {
      router.replace("/");
      return;
    }

    joiningRef.current = true;
    const joinRequestedRoom = async () => {
      if (current.code && current.code !== code) {
        if (current.role === "host") await current.endJam();
        else await current.leave();
      }
      if (
        current.code !== code
        || (current.status !== "connected" && current.status !== "connecting")
      ) {
        await current.join(code);
      }
      requestJamOpen();
      router.replace("/");
    };
    void joinRequestedRoom();
  }, [code, router]);

  return (
    <div className="page grid min-h-[40vh] place-items-center text-sm text-[#9aa8b5]">
      Opening Jam…
    </div>
  );
}
