"use client";

import dynamic from "next/dynamic";
import { useSelector } from "react-redux";
import { selectEffectiveAppearance } from "@/redux/features/appearanceSlice";

const HomeBackdropRotator = dynamic(
  () => import("@/components/Homepage/HomeBackdropRotator"),
  { ssr: false },
);

export default function AppearanceBackdrop({ isHome = false }) {
  const appearance = useSelector(selectEffectiveAppearance);
  const profile = appearance?.activeProfile;
  const background = profile?.background;
  const imageUrl = appearance?.backgroundUrl || "";

  if (!imageUrl) return isHome ? <HomeBackdropRotator /> : null;

  return (
    <div className="appearance-backdrop" aria-hidden="true">
      <div
        className="appearance-backdrop__image"
        style={{
          backgroundImage: `url(${JSON.stringify(imageUrl)})`,
          backgroundPosition: `${background?.positionX ?? 50}% ${background?.positionY ?? 50}%`,
          filter: `blur(${background?.blur ?? 0}px)`,
          transform: `scale(${background?.zoom ?? 1})`,
        }}
      />
      <div
        className="appearance-backdrop__shade"
        style={{ backgroundColor: `rgba(0, 8, 20, ${background?.darkness ?? 0.58})` }}
      />
    </div>
  );
}
