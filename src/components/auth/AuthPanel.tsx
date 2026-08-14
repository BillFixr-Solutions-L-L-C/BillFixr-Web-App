import Image from "next/image";

export default function AuthPanel() {
  return (
    <div className="relative hidden self-stretch overflow-hidden rounded-3xl bg-gradient-to-br from-primary-500 to-primary-900 lg:flex lg:flex-1 lg:flex-col lg:items-center lg:justify-center lg:gap-10">
      <Image src="/logo-icon.png" alt="" width={180} height={158} />
      <p className="absolute bottom-10 text-xs font-semibold tracking-wide text-white/70">
        AI-POWERED MEDICAL BILLS REVIEW
      </p>
    </div>
  );
}
