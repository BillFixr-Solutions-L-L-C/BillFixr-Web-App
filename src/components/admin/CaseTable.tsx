import Link from "next/link";

const rows = [
  { id: "#000189", name: "Emeka James", date: "21 Jan, 10:30 AM", status: "In Progress", action: "Automation" },
  { id: "#000187", name: "Victory Jude", date: "20 Jan, 12:30 PM", status: "Delivered", action: "Completed" },
  { id: "#000189", name: "Emeka James", date: "21 Jan, 10:30 AM", status: "In Progress", action: "Automation" },
  { id: "#000187", name: "Victory Jude", date: "20 Jan, 12:30 PM", status: "Delivered", action: "Completed" },
  { id: "#000189", name: "Emeka James", date: "21 Jan, 10:30 AM", status: "In Progress", action: "Automation" },
  { id: "#000187", name: "Victory Jude", date: "20 Jan, 12:30 PM", status: "Delivered", action: "Completed" },
  { id: "#000189", name: "Emeka James", date: "21 Jan, 10:30 AM", status: "In Progress", action: "Automation" },
  { id: "#000187", name: "Victory Jude", date: "20 Jan, 12:30 PM", status: "Delivered", action: "Completed" },
];

export default function CaseTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            <th className="py-3 pr-4">SN</th>
            <th className="py-3 pr-4">Case ID</th>
            <th className="py-3 pr-4">Client Name</th>
            <th className="py-3 pr-4">Date of Order</th>
            <th className="py-3 pr-4">Status</th>
            <th className="py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-gray-50">
              <td className="py-3 pr-4 text-gray-500">{String(i + 1).padStart(3, "0")}</td>
              <td className="py-3 pr-4 text-gray-800">
                <Link href={`/admin/cases/${row.id.replace("#", "")}`} className="hover:underline">
                  {row.id}
                </Link>
              </td>
              <td className="py-3 pr-4 text-gray-800">{row.name}</td>
              <td className="py-3 pr-4 text-gray-500">{row.date}</td>
              <td
                className={`py-3 pr-4 font-medium ${
                  row.status === "Delivered" ? "text-primary-600" : "text-accent-600"
                }`}
              >
                {row.status}
              </td>
              <td className="py-3 text-gray-500">{row.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
