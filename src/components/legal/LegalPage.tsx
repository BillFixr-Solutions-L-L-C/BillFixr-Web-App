import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-primary-50">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <h1 className="text-4xl font-bold text-primary-900 sm:text-5xl">{title}</h1>
        <p className="mt-2 text-sm text-primary-900/50">Last Updated: {updated}</p>
        <div className="mt-10 space-y-12">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
