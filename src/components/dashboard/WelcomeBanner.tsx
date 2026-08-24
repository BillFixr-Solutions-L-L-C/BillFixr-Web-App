import Image from "next/image";

export default function WelcomeBanner({
  title = "Welcome",
  subtitle = "This will take about two minutes. We'll look at your bill together",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-primary-600 to-primary-900 px-4 py-4 sm:gap-5 sm:px-8 sm:py-6">
      <Image
        src="/logo-icon.png"
        alt=""
        width={72}
        height={67}
        className="h-11 w-[47px] shrink-0 sm:h-[67px] sm:w-[72px]"
      />
      <div>
        <h2 className="text-lg font-bold text-white sm:text-2xl">{title}</h2>
        <p className="mt-0.5 text-sm text-white/85 sm:mt-1 sm:text-base">{subtitle}</p>
      </div>
    </div>
  );
}
