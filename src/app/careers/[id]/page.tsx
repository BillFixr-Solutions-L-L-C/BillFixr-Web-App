import Navbar from "@/components/landing/Navbar";
import BeforeYouPay from "@/components/landing/BeforeYouPay";
import Footer from "@/components/landing/Footer";
import { jobs } from "@/lib/jobs";

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12 14-7-5.5 15-3-6.5L5 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = jobs.find((j) => j.id === id) ?? jobs[0];

  return (
    <main className="bg-primary-50">
      <Navbar />

      <section className="mx-auto max-w-5xl px-6 pb-10 pt-6">
        <h1 className="text-3xl font-bold uppercase text-primary-900 sm:text-4xl">{job.title}</h1>
        <p className="mt-2 text-primary-900/60">{job.location}</p>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_360px]">
          <div>
            <div className="flex flex-wrap gap-x-10 gap-y-1 text-sm text-primary-900">
              <p>
                <span className="font-semibold">Job Title:</span> {job.title}
              </p>
              <p>{job.location}</p>
            </div>

            <h2 className="mt-8 text-lg font-bold text-primary-900">Responsibilities</h2>
            <ul className="mt-3 space-y-2 text-sm text-primary-900/80">
              {job.responsibilities.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden="true">·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <h2 className="mt-8 text-lg font-bold text-primary-900">Requirement:</h2>
            <ul className="mt-3 space-y-2 text-sm text-primary-900/80">
              {job.requirements.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden="true">·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-sm text-primary-900">
              <span className="font-bold">Benefit:</span> {job.benefit}
            </p>
          </div>

          <aside className="h-fit rounded-2xl border border-primary-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-primary-900">Apply for this role</h2>
            <p className="mt-1 text-sm text-primary-900/60">Input your information</p>

            <form className="mt-5 space-y-3">
              <input
                type="text"
                placeholder="Full Name"
                className="w-full rounded-full border border-gray-200 bg-gray-50 px-5 py-3 text-sm placeholder:text-gray-400 focus:border-primary-400 focus:outline-none"
              />
              <input
                type="email"
                placeholder="Email"
                className="w-full rounded-full border border-gray-200 bg-gray-50 px-5 py-3 text-sm placeholder:text-gray-400 focus:border-primary-400 focus:outline-none"
              />
              <input
                type="tel"
                placeholder="Phone number"
                className="w-full rounded-full border border-gray-200 bg-gray-50 px-5 py-3 text-sm placeholder:text-gray-400 focus:border-primary-400 focus:outline-none"
              />

              <div>
                <label className="text-sm text-primary-900">CV/Resume</label>
                <label className="mt-2 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary-200 px-6 py-8 text-center transition hover:border-primary-400">
                  <input type="file" accept=".pdf,.doc,.docx" className="hidden" />
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary-300 text-primary-600">
                    <SendIcon />
                  </span>
                  <span className="text-sm text-primary-900/80">
                    Drag & drop your CV, or <span className="font-semibold text-primary-600">browse</span>
                  </span>
                  <span className="text-xs text-primary-900/40">PDF, DOC, DOCX • Max 3MB</span>
                </label>
              </div>

              <button
                type="submit"
                className="mt-2 w-full rounded-full bg-[#0f7545] py-3.5 text-sm font-bold text-white transition hover:bg-primary-700"
              >
                Submit application
              </button>
            </form>
          </aside>
        </div>
      </section>

      <BeforeYouPay />
      <Footer />
    </main>
  );
}
