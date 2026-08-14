const steps = [
  {
    icon: (
      <path
        d="M12 16V7m0 0-3 3m3-3 3 3M7 16a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.3 9.03 3.5 3.5 0 0 1 16 16H7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    title: "Upload Your Bill",
    description: "Upload your medical bill",
  },
  {
    icon: (
      <>
        <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.6" />
        <path d="m19 19-4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
    title: "We Review & Detect Errors",
    description: "AI scans for overcharges and hidden fees",
  },
  {
    icon: (
      <>
        <path
          d="M3 6.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2V11a2 2 0 0 1-2 2H9l-3.5 3V13H5a2 2 0 0 1-2-2V6.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M13 10h4a2 2 0 0 1 2 2v3.5a2 2 0 0 1-2 2h-.5V21l-3-3.5H13a2 2 0 0 1-2-2V15"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </>
    ),
    title: "We Negotiate For You",
    description: "Our experts negotiate with providers.",
  },
  {
    icon: (
      <>
        <rect x="2" y="9" width="15" height="10" rx="1.8" stroke="currentColor" strokeWidth="1.5" />
        <rect x="6.5" y="5" width="15" height="10" rx="1.8" fill="white" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="14" cy="10" r="2.1" stroke="currentColor" strokeWidth="1.4" />
      </>
    ),
    title: "You Save Money",
    description: "Receive your reduced bill",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative overflow-hidden bg-primary-900 px-6 py-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary-500/40 blur-[100px]"
      />

      <div className="relative mx-auto max-w-5xl">
        <h2 className="text-center text-4xl font-bold leading-tight text-white sm:text-5xl">
          Use AI to instantly check your Medical Bills
        </h2>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <div
              key={step.title}
              className="flex min-h-[280px] flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-7"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-primary-600">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  {step.icon}
                </svg>
              </span>
              <div className="mt-auto pt-10">
                <h3 className="text-xl font-bold leading-snug text-white">{step.title}</h3>
                <p className="mt-2 text-sm text-white/60">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
