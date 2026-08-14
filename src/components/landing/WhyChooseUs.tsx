import Image from "next/image";

export default function WhyChooseUs() {
  return (
    <section id="why-choose-us" className="bg-primary-50 px-6 py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
        <div>
          <h2 className="text-4xl font-bold text-primary-900 sm:text-5xl">Why choose us</h2>
          <p className="mt-6 text-lg text-primary-900">
            Medical bills can be overwhelming, confusing, and financially draining.
          </p>
          <p className="mt-4 text-lg text-primary-900">
            BillFixr was created to provide a simple, automated, and stress-free way to reduce
            your medical bills, without requiring you to make calls, argue with billing
            departments, or navigate complicated insurance processes.
          </p>
        </div>

        <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-primary-100 sm:aspect-[9/10]">
          <Image
            src="/img-1.jpg"
            alt="A caregiver supporting a patient at a medical office"
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
