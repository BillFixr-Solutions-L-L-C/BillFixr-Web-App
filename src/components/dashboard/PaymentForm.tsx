"use client";

import { useEffect, useRef, useState } from "react";

type LineItem = { label: string; value: string };

function CardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CardBrandIcon({ brand }: { brand: string }) {
  if (brand === "Visa") {
    return (
      <span className="flex h-6 w-9 shrink-0 items-center justify-center rounded bg-[#1a1f71] text-[10px] font-bold italic tracking-tighter text-white">
        VISA
      </span>
    );
  }
  if (brand === "Verve") {
    return (
      <span className="flex h-6 w-9 shrink-0 items-center justify-center rounded bg-gradient-to-r from-[#0a3d62] to-[#e58e26] text-[8px] font-bold tracking-tight text-white">
        VERVE
      </span>
    );
  }
  return (
    <span className="flex h-6 w-9 shrink-0 items-center" aria-hidden="true">
      <span className="-mr-2.5 h-6 w-6 rounded-full bg-[#eb001b]/90" />
      <span className="h-6 w-6 rounded-full bg-[#f79e1b]/90" />
    </span>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const cardBrands = ["Mastercard", "Visa", "Verve"];

function CardBrandDropdown({ value, onChange }: { value: string; onChange: (brand: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-left transition focus:border-primary-400 focus:outline-none"
      >
        <CardBrandIcon brand={value} />
        <span className="flex-1 text-sm font-medium text-gray-700">{value}</span>
        <span className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}>
          <ChevronDownIcon />
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-gray-100 bg-white py-2 shadow-xl"
        >
          {cardBrands.map((option) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={value === option}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm transition hover:bg-gray-50 ${
                  value === option ? "bg-primary-50 font-semibold text-primary-700" : "text-gray-700"
                }`}
              >
                <CardBrandIcon brand={option} />
                {option}
                {value === option && <span className="ml-auto text-primary-600"><CheckIcon /></span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatCardNumber(digits: string) {
  return digits.match(/.{1,4}/g)?.join(" ") ?? "";
}

function formatExpiry(digits: string) {
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

export default function PaymentForm({
  lineItems,
  total,
  onConfirm,
}: {
  lineItems: LineItem[];
  total: string;
  onConfirm: () => void;
}) {
  const [brand, setBrand] = useState("Mastercard");
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900">Payment Details</h2>
      <p className="mt-1 text-sm text-gray-500">Enter your card information to continue</p>

      <div className="relative mt-5 overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 to-primary-900 p-6 text-white shadow-lg">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-14 -left-6 h-32 w-32 rounded-full bg-black/10"
        />

        <div className="relative flex items-center justify-between">
          <span className="h-7 w-10 rounded-md bg-gradient-to-br from-yellow-200/90 to-yellow-500/80" />
          <span className="text-sm font-semibold italic tracking-wide">{brand}</span>
        </div>

        <p className="relative mt-7 font-mono text-xl tracking-widest">
          {cardNumber ? formatCardNumber(cardNumber.padEnd(16, "•")) : "•••• •••• •••• ••••"}
        </p>

        <div className="relative mt-6 flex items-center justify-between text-xs">
          <div>
            <p className="text-white/60">Card Holder</p>
            <p className="mt-1 font-medium uppercase tracking-wide">{cardHolder || "YOUR NAME"}</p>
          </div>
          <div>
            <p className="text-white/60">Expires</p>
            <p className="mt-1 font-medium">{expiry ? formatExpiry(expiry) : "MM/YY"}</p>
          </div>
        </div>
      </div>

      <CardBrandDropdown value={brand} onChange={setBrand} />

      <div className="mt-5 space-y-4">
        <div>
          <label className="text-sm text-gray-700">Card number</label>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <CardIcon />
            </span>
            <input
              value={formatCardNumber(cardNumber)}
              onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, "").slice(0, 16))}
              placeholder="1234 5678 9012 3456"
              inputMode="numeric"
              className="w-full rounded-lg border border-primary-200 py-2.5 pl-11 pr-4 text-sm focus:border-primary-400 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-gray-700">Card Holder</label>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <UserIcon />
            </span>
            <input
              value={cardHolder}
              onChange={(e) => setCardHolder(e.target.value)}
              placeholder="Full name on card"
              className="w-full rounded-lg border border-primary-200 py-2.5 pl-11 pr-4 text-sm focus:border-primary-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <label className="text-sm text-gray-700">Expiry Date</label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <CalendarIcon />
              </span>
              <input
                value={formatExpiry(expiry)}
                onChange={(e) => setExpiry(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="MM/YY"
                inputMode="numeric"
                className="w-full rounded-lg border border-primary-200 py-2.5 pl-11 pr-4 text-sm focus:border-primary-400 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-700">CVC</label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <LockIcon className="h-[18px] w-[18px]" />
              </span>
              <input
                value={cvc}
                onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="123"
                inputMode="numeric"
                className="w-full rounded-lg border border-primary-200 py-2.5 pl-11 pr-4 text-sm focus:border-primary-400 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-gray-50 px-5 py-4">
        {lineItems.map((item) => (
          <div key={item.label} className="flex justify-between py-1 text-sm text-gray-500">
            <span>{item.label}</span>
            <span>{item.value}</span>
          </div>
        ))}
        <div className="my-2 border-t border-gray-200" />
        <div className="flex justify-between">
          <span className="text-sm font-semibold text-primary-700">Total Amount</span>
          <span className="text-sm font-bold text-primary-700">{total}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onConfirm}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary-600 py-3.5 text-sm font-semibold text-white transition hover:bg-primary-700"
      >
        <LockIcon /> Confirm Payment
      </button>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-400">
        <LockIcon /> Payments are encrypted and securely processed
      </p>
    </div>
  );
}
