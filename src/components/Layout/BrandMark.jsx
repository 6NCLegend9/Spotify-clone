import Image from "next/image";
import Link from "next/link";
import logo from "../../assets/HayKasa-banner-removebg.png";

export default function BrandMark({ onClick, className = "" }) {
  return (
    <Link href="/" onClick={onClick} className={`flex items-center ${className}`}>
      <Image
        src={logo}
        alt="HayKasa"
        priority
        className="h-8 w-auto object-contain sm:h-9 lg:h-10"
      />
    </Link>
  );
}
