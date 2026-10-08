// The registered business details, shown publicly in the footer and on
// the pricing page. Card processors expect a real address, a contactable
// phone number and a support email to be findable on the site before they
// will approve live payments, so these are deliberately not tucked away
// behind a form.
//
// One definition, so the address can never say one thing in the footer and
// another on a page a reviewer happens to open.

export const BUSINESS_NAME = "BillFixr Solutions LLC";

export const BUSINESS_ADDRESS_LINES = [
  "30 N Gould St, Ste N",
  "Sheridan, WY 82801",
  "United States",
];

// Digits only, for the tel: href — the display form keeps its formatting.
export const BUSINESS_PHONE = "(307) 201-8482";
export const BUSINESS_PHONE_HREF = "tel:+13072018482";

export const SUPPORT_EMAIL = "support@billfixr.com";
export const SUPPORT_EMAIL_HREF = `mailto:${SUPPORT_EMAIL}`;
