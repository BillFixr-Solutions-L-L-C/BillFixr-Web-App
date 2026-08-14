import Image from "next/image";

export default function Logo({
  className = "",
  inverted = false,
  size = 28,
}: {
  className?: string;
  inverted?: boolean;
  size?: number;
}) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold text-xl ${className}`}>
      <Image
        src={inverted ? "/logo-icon-white.png" : "/logo-icon-green.png"}
        alt=""
        width={size}
        height={size}
        priority
      />
      <span>
        <span className={inverted ? "text-white" : "text-primary-600"}>Bill</span>
        <span className="text-accent-500">Fixr</span>
      </span>
    </span>
  );
}
