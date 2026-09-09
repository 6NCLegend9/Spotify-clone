import Image from "next/image";
import Link from "next/link";
import banner from "@/assets/HayKasa-banner-removebg.png";
import logo from "@/assets/HayKasa-logo-removebg.png";
import { SITE_NAME } from "@/utils/siteConfig";

export default function BrandMark({ onClick, className = "", compact = false }) {
  return (
    <Link
      href="/"
      onClick={onClick}
      className={`brand-mark ${compact ? "is-compact" : ""} ${className}`.trim()}
    >
      <Image
        src={compact ? logo : banner}
        alt={SITE_NAME}
        priority
        className="brand-mark-lockup"
      />
    </Link>
  );
}
