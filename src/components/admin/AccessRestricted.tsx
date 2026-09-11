export default function AccessRestricted() {
  return (
    <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
      <p className="text-lg font-semibold text-gray-900">Access restricted</p>
      <p className="mt-2 text-sm text-gray-500">Your role doesn&apos;t have access to this section.</p>
    </div>
  );
}
