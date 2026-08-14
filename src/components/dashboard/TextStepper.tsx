const steps = ["Upload", "Scan", "Negotiation", "Response", "Complete"];

export default function TextStepper({ activeStep }: { activeStep: number }) {
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center gap-3">
          <span
            className={`text-sm font-medium ${
              i <= activeStep ? "font-bold text-primary-700" : "text-gray-400"
            }`}
          >
            {step}
          </span>
          {i < steps.length - 1 && <span className="h-px w-8 bg-gray-300" />}
        </div>
      ))}
    </div>
  );
}
