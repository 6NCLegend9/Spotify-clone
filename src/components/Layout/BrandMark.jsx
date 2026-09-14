import Link from "next/link";
import { SITE_NAME } from "@/utils/siteConfig";
import styles from "./brandMark.module.css";

export default function BrandMark({ onClick, className = "", compact = false }) {
  return <Link href="/" onClick={onClick} aria-label={`${SITE_NAME} home`} className={`brand-mark ${styles.brand} ${compact ? "is-compact" : ""} ${className}`.trim()}>
    <svg className={styles.symbol} width="40" height="44" viewBox="0 0 40 44" fill="currentColor" aria-hidden="true">
      <rect x="2" y="17" width="4" height="10" rx="2" /><rect x="10" y="10" width="4" height="24" rx="2" /><rect x="18" y="2" width="4" height="40" rx="2" /><rect x="26" y="10" width="4" height="24" rx="2" /><rect x="34" y="17" width="4" height="10" rx="2" />
    </svg>
    {!compact && <span className={styles.wordmark}><strong>KASA</strong><small>MUSIC LIVES HERE</small></span>}
  </Link>;
}
