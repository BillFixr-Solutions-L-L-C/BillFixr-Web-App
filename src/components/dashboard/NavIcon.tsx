// One icon per nav item, matching the Figma sidebar. (This replaced a
// single repeated book glyph that every item shared.)
export type NavIconName = "dashboard" | "document" | "case" | "completed" | "support" | "settings" | "logout";

export default function NavIcon({ name, active = false }: { name: NavIconName; active?: boolean }) {
  const color = name === "logout" ? "#dc4444" : active ? "#0F7545" : "#4D6276";
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true as const,
    className: "shrink-0",
  };

  if (name === "dashboard") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7.5" height="7.5" rx="2" fill={color} />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" fill={color} />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" fill={color} />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" fill={color} />
      </svg>
    );
  }

  if (name === "document") {
    return (
      <svg {...common}>
        <path
          d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"
          stroke={color}
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path d="M14 3v5h5" stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M9 13h6M9 17h4" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  // Active Case and Completed Case are both briefcases in the design; the
  // completed one carries a tick.
  if (name === "case" || name === "completed") {
    return (
      <svg {...common}>
        <rect x="3" y="7.5" width="18" height="12.5" rx="2.5" stroke={color} strokeWidth="1.7" />
        <path
          d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5"
          stroke={color}
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        {name === "completed" ? (
          <path d="M9.5 13.8l2 2 3.5-3.6" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M3 12h18" stroke={color} strokeWidth="1.7" />
        )}
      </svg>
    );
  }

  if (name === "support") {
    return (
      <svg {...common}>
        <path d="M4 13a8 8 0 0 1 16 0" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
        <rect x="2.6" y="13" width="4.4" height="6.5" rx="2.2" stroke={color} strokeWidth="1.7" />
        <rect x="17" y="13" width="4.4" height="6.5" rx="2.2" stroke={color} strokeWidth="1.7" />
      </svg>
    );
  }

  if (name === "settings") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3.2" stroke={color} strokeWidth="1.7" />
        <path
          d="M19.4 14a1.6 1.6 0 0 0 .32 1.76l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-1 1.46V20a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .33-1.76 1.6 1.6 0 0 0-1.47-1H4a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.46-1 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.76.33H10a1.6 1.6 0 0 0 1-1.47V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.46 1.6 1.6 0 0 0 1.76-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.76V10a1.6 1.6 0 0 0 1.47 1H20a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.46 1Z"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" fill={color} />
      <path d="M13.5 8.5 10 12l3.5 3.5M10 12h6.5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
