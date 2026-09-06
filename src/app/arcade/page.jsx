"use client";

import dynamic from "next/dynamic";

// Canvas engine and audio graph load only when the arcade route is opened.
const ArcadeStage = dynamic(() => import("@/components/Arcade/ArcadeStage"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#04070d] text-sm text-[#9aa8b5]">
      Loading the arcade…
    </div>
  ),
});

export default function ArcadePage() {
  return <ArcadeStage />;
}
