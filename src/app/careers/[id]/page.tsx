import Navbar from "@/components/landing/Navbar";
import BeforeYouPay from "@/components/landing/BeforeYouPay";
import Footer from "@/components/landing/Footer";
import ApplyForm from "@/components/careers/ApplyForm";
import { jobs } from "@/lib/jobs";

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

            <ApplyForm jobId={job.id} />
          </aside>
        </div>
      </section>

      <BeforeYouPay />
      <Footer />
    </main>
  );
}
