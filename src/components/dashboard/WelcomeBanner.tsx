import Image from "next/image";

export default function WelcomeBanner({
  title = "Welcome",
  subtitle = "This will take about two minutes. We'll look at your bill together",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-primary-600 to-primary-900 px-6 py-4">
      <Image src="/logo-icon.png" alt="" width={56} height={52} className="shrink-0" />
      <div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <p className="mt-0.5 text-sm text-white/85">{subtitle}</p>
      </div>
    </div>
  );
}
