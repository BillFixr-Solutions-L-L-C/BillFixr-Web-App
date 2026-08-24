import Link from "next/link";
import type { CSSProperties } from "react";

function Bubble({
  className,
  from,
  to,
  x = 0,
  y = -18,
  scale = 1.04,
  duration = 7,
  delay = 0,
}: {
  className: string;
  from: string;
  to: string;
  x?: number;
  y?: number;
  scale?: number;
  duration?: number;
  delay?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={`animate-float pointer-events-none absolute rounded-full ${className}`}
      style={
        {
          background: `radial-gradient(circle at 32% 28%, ${from}, ${to} 75%)`,
          "--float-x": `${x}px`,
          "--float-y": `${y}px`,
          "--float-scale": scale,
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
        } as CSSProperties
      }
    />
  );
}

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      <Bubble className="-right-16 -top-10 h-[26rem] w-[26rem] opacity-90" from="#e9f7ef" to="#a9dcbf" x={26} y={-46} scale={1.08} duration={6} delay={0} />
      <Bubble className="-bottom-32 -left-16 h-80 w-80 opacity-90" from="#eefaf3" to="#94d3ac" x={-30} y={38} scale={1.08} duration={7} delay={0.5} />
      <Bubble className="left-10 top-20 h-16 w-16 opacity-80" from="#ffffff" to="#bfe6cf" x={16} y={-32} scale={1.15} duration={3.5} delay={0.2} />
      <Bubble className="right-24 top-64 h-10 w-10 opacity-80" from="#ffffff" to="#a9dcbf" x={-20} y={28} scale={1.2} duration={3} delay={1.1} />
      <Bubble className="bottom-16 right-10 h-24 w-24 opacity-80" from="#eefaf3" to="#94d3ac" x={24} y={-36} scale={1.12} duration={4.5} delay={0.8} />
      <Bubble className="left-1/4 bottom-8 h-8 w-8 opacity-70" from="#ffffff" to="#bfe6cf" x={-16} y={-24} scale={1.2} duration={2.8} delay={1.6} />

      <div className="relative mx-auto max-w-5xl px-6 py-24 text-center sm:py-32">
        <div className="relative rounded-[2rem] border border-primary-100/70 bg-white/40 px-4 py-16 backdrop-blur-sm sm:px-12 sm:py-20">
          <span
            aria-hidden="true"
            className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-primary-100"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-primary-100"
          />

          <span className="inline-flex items-center rounded-full border border-primary-200 bg-white px-5 py-2 text-xs font-semibold tracking-wide text-primary-700">
            AI-POWERED MEDICAL BILLS REVIEW
          </span>

          <h1 className="mt-8 font-sans text-4xl font-bold leading-[1.05] text-primary-900 sm:text-7xl">
            Take Control of Your Medical Bills-
            <span className="text-accent-500">Automatically</span>
          </h1>

          <p className="mt-6 text-xl text-primary-900/70">
            Reduce your cost with AI-powered bill negotiation
          </p>

          <Link
            href="/signup"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-accent-500 px-10 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-accent-600"
          >
            Upload Your Bill
          </Link>
        </div>
      </div>
    </section>
  );
}
