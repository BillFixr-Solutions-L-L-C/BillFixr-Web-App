export default function FlowCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex justify-center">
      <div className="flex min-h-[360px] w-full max-w-[560px] flex-col items-center justify-center rounded-[36px] border border-[rgba(164,164,164,0.1)] bg-white px-8 py-10 text-center shadow-[0px_4px_4px_0px_rgba(0,0,0,0.1)]">
        {children}
      </div>
    </div>
  );
}
