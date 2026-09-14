import Link from "next/link";
import { SITE_NAME } from "@/utils/siteConfig";
import styles from "./navigation.module.css";

export default function BrandMark({ onClick, className = "", compact = false }) {
  return (
    <Link href="/" onClick={onClick} aria-label={`${SITE_NAME} home`}
      className={`brand-mark ${styles.brand} ${compact ? "is-compact" : ""} ${className}`.trim()}>
      <svg width="38" height="44" viewBox="0 0 38 44" fill="none" aria-hidden="true">
        <path d="M4 19v7M11.5 12v21M19 4v36M26.5 11v22M34 18v9" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
      {!compact && <span className={styles.brandCopy}><strong>KASA</strong><small>MUSIC LIVES HERE</small></span>}
    </Link>
  );
}
