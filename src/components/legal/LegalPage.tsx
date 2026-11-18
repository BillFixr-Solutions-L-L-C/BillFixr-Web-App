import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import LegalTranslationNotice from "@/components/legal/LegalTranslationNotice";

// Stays synchronous on purpose. It used to call getT() itself, which made
// it an async component -- and an async component nested inside the
// element a page returns cannot be rendered by React Testing Library, so
// every legal-page test rendered an empty div. The four pages are already
// async and already hold a translator, so they pass the two strings down.
export default function LegalPage({
  title,
  updatedLabel,
  updated,
  children,
}: {
  title: string;
  /** "Last Updated:", already translated. */
  updatedLabel: string;
  /** The date itself, already translated. */
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-primary-50">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <h1 className="text-4xl font-bold text-primary-900 sm:text-5xl">{title}</h1>
        <p className="mt-2 text-sm text-primary-900/50">
          {updatedLabel} {updated}
        </p>
        <LegalTranslationNotice />
        <div className="mt-10 space-y-12">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
