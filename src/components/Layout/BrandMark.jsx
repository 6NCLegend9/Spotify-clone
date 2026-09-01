import Image from "next/image";
import Link from "next/link";
import logo from "../../assets/HeyKasa.png";
import logoWhite from "../../assets/logoWhite.png";

export default function BrandMark({
  variant = "color",
  onClick,
  className = "",
}) {
  return (
    <Link href="/" onClick={onClick} className={`flex items-center ${className}`}>
      <Image
        src={variant === "white" ? logoWhite : logo}
        alt="HeyKasa"
        priority
        className="h-8 w-auto object-contain sm:h-9 lg:h-10"
      />
    </Link>
  );
}
