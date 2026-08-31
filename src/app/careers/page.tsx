import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import BeforeYouPay from "@/components/landing/BeforeYouPay";
import Footer from "@/components/landing/Footer";
import { getOpenJobs } from "@/lib/jobs";

function BriefcaseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="8" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 13h18" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export default async function CareersPage() {
  const jobs = await getOpenJobs();

  return (
    <main className="bg-primary-50">
      <Navbar />

      <section className="mx-auto max-w-5xl px-6 pb-10 pt-6 sm:pb-14">
        <h1 className="text-4xl font-bold leading-tight text-primary-900 sm:text-5xl">
          Help shape the future together
        </h1>
        <p className="mt-3 max-w-lg text-primary-900/70">
          We&apos;re looking for talented, driven individuals to help us achieve our mission.
        </p>

        <div className="relative mt-8 aspect-[21/8] overflow-hidden rounded-2xl bg-primary-100">
          <Image
            src="/img-2.jpg"
            alt="BillFixr team members working together"
            fill
            sizes="(min-width: 1024px) 1024px, 100vw"
            className="object-cover object-[50%_25%]"
          />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-primary-900 sm:text-4xl">Currently open positions</h2>
          <p className="mx-auto mt-3 max-w-md text-primary-900/70">
            View the roles we&apos;re currently hiring for and apply. We&apos;ll review your application and be in touch.
          </p>
        </div>

        <div className="mt-10 space-y-5">
          {jobs.length === 0 && (
            <p className="text-center text-primary-900/60">No open positions right now — check back soon.</p>
          )}
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary-200 bg-white p-6"
            >
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0f7545] text-white">
                  <BriefcaseIcon />
                </span>
                <div>
                  <h3 className="text-lg font-bold uppercase text-primary-900">{job.title}</h3>
                  <p className="mt-1 max-w-xl text-sm text-primary-900/60">{job.listingDescription}</p>
                </div>
              </div>

              <Link
                href={`/careers/${job.id}`}
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#0f7545] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700"
              >
                Apply now →
              </Link>
            </div>
          ))}
        </div>
      </section>

      <BeforeYouPay />
      <Footer />
    </main>
  );
}
