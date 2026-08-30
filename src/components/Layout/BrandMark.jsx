import Image from "next/image";
import Link from "next/link";
import logo from "../../assets/hayasaka.png";
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
        alt="Hayasaka"
        priority
        className="h-8 w-auto object-contain sm:h-9 lg:h-10"
      />
    </Link>
  );
}
