import { customerLanguage, DEFAULT_LANGUAGE, type Language } from "@/lib/language";
import type { SupabaseClient } from "@supabase/supabase-js";

// Telling the customer something happened on their own case.
//
// The notifications table and the bell have existed since the beginning,
// and until now every row in it belonged to an admin: the two database
// triggers write to admins, and `notifyAdmins` writes to admins. A
// customer had a table they were allowed to read — the RLS policy has
// always been `user_id = auth.uid() or is_admin()` — and nothing ever
// wrote them a row, and no bell to read it in.
//
// What the customer did get was email, and email is the right channel for
// the big moments. It is not a record of the case. Someone who opens the
// dashboard a week later, having archived or lost the mail, had no way to
// see that we wrote to their provider on Tuesday and the provider
// answered on Friday.
//
// ── Why the message is stored already translated ──────────────────────
//
// The table holds `type` and `message`, and `message` is the text the
// bell renders. There is no params column, so a key translated at render
// time would mean either a schema change or a lookup table that silently
// shows an untranslated key when the two drift.
//
// Instead this writes the message in the customer's COMMUNICATION
// language, which is exactly what the emails do (see emailCopy.ts and
// language.ts): what they chose when they registered, not the display
// cookie they may have flipped since. A notice is a record of something
// we told them, so it stays in the language we told them in — if they
// switch the site to English next month, the Spanish notice they were
// sent is still what was sent.

export type CustomerNotificationType =
  | "letter_sent"
  | "provider_replied"
  | "settlement_reached"
  | "case_closed_no_response"
  | "payment_failed";

/** Copy that takes no values. */
type Plain = Record<Language, string>;
/** Copy that interpolates an amount. */
type WithAmount = Record<Language, (amount: string) => string>;

const PLAIN: Record<Exclude<CustomerNotificationType, "settlement_reached">, Plain> = {
  letter_sent: {
    en: "We sent your dispute letter to your provider. They typically reply within a few weeks.",
    es: "Enviamos tu carta de disputa a tu proveedor. Suelen responder en unas semanas.",
  },
  provider_replied: {
    en: "Your provider replied. Open your case to see what they said.",
    es: "Tu proveedor respondió. Abre tu caso para ver lo que dijo.",
  },
  case_closed_no_response: {
    en: "We closed your case because your provider never replied. Nothing is owed.",
    es: "Cerramos tu caso porque tu proveedor nunca respondió. No debes nada.",
  },
  payment_failed: {
    en: "A payment did not go through. Your case is not affected — you can try again from your case page.",
    es: "Un pago no se completó. Tu caso no se ve afectado: puedes intentarlo de nuevo desde la página de tu caso.",
  },
};

const SETTLEMENT: WithAmount = {
  en: (amount) => `Your provider agreed to reduce your bill by ${amount}.`,
  es: (amount) => `Tu proveedor aceptó reducir tu factura en ${amount}.`,
};

/** US dollars, in the notification's own language. The figure is money
 *  the customer is about to be charged a share of, so it is formatted
 *  once, here, rather than by each caller. */
function money(amount: number, language: Language): string {
  return amount.toLocaleString(language === "es" ? "es-US" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function customerNotificationMessage(
  type: CustomerNotificationType,
  language: Language,
  amount?: number,
): string {
  if (type === "settlement_reached") {
    // An amount is the whole content of this one. Without it there is
    // nothing worth saying, so the caller is required to pass it and this
    // is a programming error, not a runtime condition.
    if (amount == null) throw new Error("settlement_reached needs an amount");
    return SETTLEMENT[language](money(amount, language));
  }
  return PLAIN[type][language];
}

/**
 * Writes one notification for one customer.
 *
 * Needs the service role: these are written during a cron run, a webhook
 * and an admin's request as often as during the customer's own, so there
 * is frequently no customer session to write under.
 *
 * Never throws, for the same reason `notifyAdmins` never throws: the work
 * this announces has already happened — the letter has gone, the case has
 * advanced, the money has moved — and failing that work because a bell
 * could not be rung would be the wrong trade every time.
 */
export async function notifyCustomer(
  admin: SupabaseClient,
  notification: {
    userId: string;
    type: CustomerNotificationType;
    amount?: number;
    /** Pass this when the caller already holds the profile, so the same
     *  row is not read twice in one request. */
    language?: Language;
  },
): Promise<{ sent: number }> {
  try {
    let language = notification.language;
    if (!language) {
      const { data: profile } = await admin
        .from("profiles")
        .select("communication_language")
        .eq("id", notification.userId)
        .single();
      language = profile
        ? customerLanguage(profile as { communication_language?: string | null })
        : DEFAULT_LANGUAGE;
    }

    const { error } = await admin.from("notifications").insert({
      user_id: notification.userId,
      type: notification.type,
      message: customerNotificationMessage(notification.type, language, notification.amount),
    });
    if (error) {
      console.error("Could not write a customer notification:", error.message);
      return { sent: 0 };
    }
    return { sent: 1 };
  } catch (err) {
    console.error("Could not write a customer notification:", err);
    return { sent: 0 };
  }
}
