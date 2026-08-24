import Image from "next/image";
import Link from "next/link";

export default function BeforeYouPay() {
  return (
    <section className="flex min-h-screen flex-col items-center justify-center bg-primary-50 px-6 py-24 text-center">
      <div className="mx-auto max-w-4xl">
        <Image
          src="/logo-icon.png"
          alt=""
          width={320}
          height={281}
          className="mx-auto mb-8"
        />

        <h2 className="text-2xl font-semibold text-[#003322] sm:whitespace-nowrap sm:text-4xl">
          Before you pay, let BillFixr read it
        </h2>
        <p className="mt-4 text-lg text-primary-900/50">
          Because bills shouldn&apos;t come as a burden.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-full bg-[#0f7545] px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            Review Your Bill
          </Link>
          <Link
            href="/#contact"
            className="rounded-full border border-[#0f7545] px-8 py-3.5 text-sm font-semibold text-[#0f7545] transition hover:bg-white"
          >
            Contact us
          </Link>
        </div>
      </div>
    </section>
  );
}
