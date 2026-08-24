export default function ResumePreview() {
  return (
    <div className="aspect-[3/4] w-full space-y-5 rounded-lg border border-gray-100 bg-white p-7 text-[13px] leading-normal text-gray-500">
      <div className="flex items-start justify-between">
        <p className="text-lg font-bold tracking-wide text-gray-900">CV</p>
        <span className="h-16 w-16 shrink-0 rounded bg-primary-100" />
      </div>

      <div className="grid grid-cols-2 gap-4">
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
        <p className="bg-gray-100 px-2 py-1.5 font-semibold uppercase tracking-wide text-gray-600">Career</p>
        <div className="mt-2 space-y-2">
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
        <p className="bg-gray-100 px-2 py-1.5 font-semibold uppercase tracking-wide text-gray-600">Education</p>
        <div className="mt-2 space-y-2">
          <div>
            <p className="font-semibold text-gray-800">University Name</p>
            <p>Field of Study</p>
          </div>
        </div>
      </div>

      <div>
        <p className="bg-gray-100 px-2 py-1.5 font-semibold uppercase tracking-wide text-gray-600">Skills</p>
        <p className="mt-2">Relevant tools, languages, and areas of expertise.</p>
      </div>
    </div>
  );
}
