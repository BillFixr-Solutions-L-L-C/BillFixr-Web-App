export default function ResumePreview() {
  return (
    <div className="aspect-[3/4] w-full space-y-4 rounded-lg border border-gray-100 bg-white p-6 text-[9px] leading-tight text-gray-500">
      <div className="flex items-start justify-between">
        <p className="text-sm font-bold tracking-wide text-gray-900">CV</p>
        <span className="h-14 w-14 shrink-0 rounded bg-primary-100" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="font-semibold text-gray-800">Name</p>
          <p>Applicant Name</p>
        </div>
        <div>
          <p className="font-semibold text-gray-800">Phone</p>
          <p>+234 816 907 650</p>
        </div>
        <div className="col-span-2">
          <p className="font-semibold text-gray-800">Email</p>
          <p>applicant@example.com</p>
        </div>
      </div>

      <div>
        <p className="bg-gray-100 px-1.5 py-1 font-semibold uppercase tracking-wide text-gray-600">Career</p>
        <div className="mt-1.5 space-y-1.5">
          <div>
            <p className="font-semibold text-gray-800">BillFixr — Applicant Role</p>
            <p>Overview of key responsibilities and achievements.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800">Previous Company</p>
            <p>Overview of key responsibilities.</p>
          </div>
        </div>
      </div>

      <div>
        <p className="bg-gray-100 px-1.5 py-1 font-semibold uppercase tracking-wide text-gray-600">Education</p>
        <div className="mt-1.5 space-y-1.5">
          <div>
            <p className="font-semibold text-gray-800">University Name</p>
            <p>Field of Study</p>
          </div>
        </div>
      </div>

      <div>
        <p className="bg-gray-100 px-1.5 py-1 font-semibold uppercase tracking-wide text-gray-600">Skills</p>
        <p className="mt-1.5">Relevant tools, languages, and areas of expertise.</p>
      </div>
    </div>
  );
}
