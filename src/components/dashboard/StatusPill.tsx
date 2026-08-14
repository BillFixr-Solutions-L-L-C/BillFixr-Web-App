const tones = {
  success: "text-primary-600",
  warning: "text-accent-600",
  danger: "text-red-500",
  muted: "text-gray-400",
} as const;

export default function StatusPill({
  children,
  tone = "success",
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
}) {
  return <span className={`text-sm font-medium ${tones[tone]}`}>{children}</span>;
}
