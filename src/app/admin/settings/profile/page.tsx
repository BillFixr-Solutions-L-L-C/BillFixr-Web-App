export default function AdminProfileSettingsPage() {
  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Settings</h1>

      <div className="max-w-md rounded-2xl bg-white p-6 shadow-sm">
        <div className="h-24 w-24 rounded-full bg-gray-100" />

        <div className="mt-6 flex flex-col gap-5">
          <div>
            <label className="text-sm text-gray-600">Full name</label>
            <input
              defaultValue="Grace Chiamaka"
              className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-700"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Work-mail</label>
            <input
              defaultValue="Grace@wearwise.com"
              className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-700"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Phone</label>
            <input
              defaultValue="234 81305965"
              className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-700"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Role</label>
            <select className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900">
              <option>Administrator</option>
              <option>Content moderator</option>
              <option>Finance admin</option>
              <option>Customer support</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
