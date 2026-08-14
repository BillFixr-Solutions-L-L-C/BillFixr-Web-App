type Row = {
  id: string;
  customer: string;
  amount: string;
  date: string;
  time: string;
  status: string;
};

export default function PaymentsTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            <th className="py-3 pr-4">SN</th>
            <th className="py-3 pr-4">Order ID</th>
            <th className="py-3 pr-4">Customer</th>
            <th className="py-3 pr-4">Amount</th>
            <th className="py-3 pr-4">Date</th>
            <th className="py-3 pr-4">Time</th>
            <th className="py-3 pr-4">Channel</th>
            <th className="py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-gray-50">
              <td className="py-3 pr-4 text-gray-500">{String(i + 1).padStart(3, "0")}</td>
              <td className="py-3 pr-4 text-gray-800">{row.id}</td>
              <td className="py-3 pr-4 text-gray-800">{row.customer}</td>
              <td className="py-3 pr-4 text-gray-800">{row.amount}</td>
              <td className="py-3 pr-4 text-gray-500">{row.date}</td>
              <td className="py-3 pr-4 text-gray-500">{row.time}</td>
              <td className="py-3 pr-4 text-gray-500">Card</td>
              <td
                className={`py-3 font-medium ${
                  row.status === "Successful" ? "text-primary-600" : "text-accent-600"
                }`}
              >
                {row.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
