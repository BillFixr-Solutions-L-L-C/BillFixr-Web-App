import Image from "next/image";

export default function WelcomeBanner({
  title = "Welcome",
  subtitle = "This will take about two minutes. We'll look at your bill together",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-5 rounded-2xl bg-gradient-to-br from-primary-600 to-primary-900 px-8 py-6">
      <Image src="/logo-icon.png" alt="" width={72} height={67} className="shrink-0" />
      <div>
        <h2 className="text-2xl font-bold text-white">{title}</h2>
        <p className="mt-1 text-base text-white/85">{subtitle}</p>
      </div>
    </div>
  );
}
