const steps = ["Upload", "Scan", "Negotiation", "Response", "Complete"];

export default function TextStepper({ activeStep }: { activeStep: number }) {
  return (
    <div className="mt-4 flex items-center justify-center gap-1 overflow-x-auto px-1 sm:gap-3 sm:px-0">
      {steps.map((step, i) => (
        <div key={step} className="flex shrink-0 items-center gap-1 sm:gap-3">
          <span
            className={`whitespace-nowrap text-[11px] font-medium sm:text-sm ${
              i <= activeStep ? "font-bold text-primary-700" : "text-gray-400"
            }`}
          >
            {step}
          </span>
          {i < steps.length - 1 && <span className="h-px w-3 shrink-0 bg-gray-300 sm:w-8" />}
        </div>
      ))}
    </div>
  );
}
