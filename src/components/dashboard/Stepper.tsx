const steps = ["Upload", "Scan", "Negotiation", "Response", "Complete"];

export default function Stepper({ activeStep }: { activeStep: number }) {
  return (
    <div className="flex items-center">
      {steps.map((step, i) => {
        const done = i < activeStep;
        const active = i === activeStep;
        return (
          <div key={step} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                  done
                    ? "bg-primary-600 text-white"
                    : active
                      ? "border-2 border-primary-600 text-primary-600"
                      : "border-2 border-gray-200 text-gray-400"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={`text-xs font-medium ${
                  done || active ? "text-primary-700" : "text-gray-400"
                }`}
              >
                {step}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span
                className={`mx-2 mb-5 h-0.5 flex-1 ${done ? "bg-primary-600" : "bg-gray-200"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
