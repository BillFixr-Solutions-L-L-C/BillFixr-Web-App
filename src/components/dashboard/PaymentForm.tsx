type LineItem = { label: string; value: string };

export default function PaymentForm({
  lineItems,
  total,
  onConfirm,
}: {
  lineItems: LineItem[];
  total: string;
  onConfirm: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 rounded-full border border-gray-100 bg-white px-5 py-3 shadow-sm">
        <span className="h-2.5 w-2.5 rounded-full bg-primary-500" />
        <span className="flex h-5 w-9 items-center">
          <span className="-mr-2.5 h-5 w-5 rounded-full bg-red-500/80" />
          <span className="h-5 w-5 rounded-full bg-accent-500/80" />
        </span>
        <select className="flex-1 bg-transparent text-sm text-gray-700 focus:outline-none">
          <option>Mastercard</option>
          <option>Visa</option>
          <option>Verve</option>
        </select>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <label className="text-sm text-gray-700">Card number</label>
          <input className="mt-1 w-full rounded-lg border border-primary-200 px-4 py-2.5 text-sm focus:border-primary-400 focus:outline-none" />
        </div>
        <div>
          <label className="text-sm text-gray-700">Card Holder</label>
          <input className="mt-1 w-full rounded-lg border border-primary-200 px-4 py-2.5 text-sm focus:border-primary-400 focus:outline-none" />
        </div>
        <div>
          <label className="text-sm text-gray-700">Expiry Date</label>
          <input className="mt-1 w-full rounded-lg border border-primary-200 px-4 py-2.5 text-sm focus:border-primary-400 focus:outline-none" />
        </div>
        <div>
          <label className="text-sm text-gray-700">CVC</label>
          <input className="mt-1 w-full rounded-lg border border-primary-200 px-4 py-2.5 text-sm focus:border-primary-400 focus:outline-none" />
        </div>
      </div>

      <div className="mt-5 rounded-lg bg-gray-50 px-5 py-3">
        {lineItems.map((item) => (
          <div key={item.label} className="flex justify-between py-1 text-sm text-gray-500">
            <span>{item.label}</span>
            <span>{item.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between rounded-lg bg-gray-50 px-5 py-3">
        <span className="text-sm font-semibold text-primary-700">Total Amount</span>
        <span className="text-sm font-bold text-primary-700">{total}</span>
      </div>

      <button
        type="button"
        onClick={onConfirm}
        className="mt-6 rounded-full bg-primary-600 px-8 py-3 text-sm font-semibold text-white hover:bg-primary-700"
      >
        Confirm Payment
      </button>
    </div>
  );
}
