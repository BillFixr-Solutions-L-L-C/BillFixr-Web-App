import { DEFAULT_LANGUAGE, type Language } from "@/lib/language";

// The customer-facing email copy, in each language we write to customers
// in.
//
// Only the emails BillFixr sends to the CUSTOMER live here. Nothing
// addressed to a hospital does, and nothing ever should: a dispute letter,
// a follow-up and a counter-offer are English whoever the customer is, and
// they are written by the engine, not from this file. See
// src/lib/language.ts.
//
// The Spanish here is written to be read by someone worried about a
// medical bill: plain, short, and never cheerier than the English. It
// should be reviewed by a native speaker before launch -- it is
// translation by a careful non-specialist, which is good enough to ship
// behind a flag and not good enough to claim as localised.

export type EmailMessage = {
  subject: string;
  heading: string;
  body: string;
  cta: string;
};

type MessageId = "responseReceived" | "closedNoResponse" | "stillWaiting";

const MESSAGES: Record<MessageId, Record<Language, EmailMessage>> = {
  // The provider wrote back.
  responseReceived: {
    en: {
      subject: "Your provider responded",
      heading: "Your provider responded",
      body: "Good news - your provider has responded to your case. Review the details and next steps from your dashboard.",
      cta: "View Your Case",
    },
    es: {
      subject: "Su proveedor respondió",
      heading: "Su proveedor respondió",
      body: "Buenas noticias: su proveedor respondió a su caso. Revise los detalles y los siguientes pasos en su panel.",
      cta: "Ver su caso",
    },
  },

  // Three follow-ups, no reply, case closed.
  closedNoResponse: {
    en: {
      subject: "Your case has been closed",
      heading: "Your provider didn't respond",
      body:
        "We sent your dispute and followed up three times, and your provider didn't reply. " +
        "We've closed the case and your full documented record is available from your dashboard - " +
        "the dispute we sent, every follow-up, and the dates they went out.",
      cta: "View Your Case",
    },
    es: {
      subject: "Su caso se ha cerrado",
      heading: "Su proveedor no respondió",
      body:
        "Enviamos su disputa y dimos seguimiento tres veces, y su proveedor no respondió. " +
        "Hemos cerrado el caso y su expediente completo está disponible en su panel: " +
        "la disputa que enviamos, cada seguimiento y las fechas en que se enviaron.",
      cta: "Ver su caso",
    },
  },

  // The scheduled "nothing has happened yet" note.
  stillWaiting: {
    en: {
      subject: "Update on your BillFixr case",
      heading: "Still waiting on your provider",
      body:
        "We're still waiting to hear back from your provider about {filename}. " +
        "No action is needed on your end - we'll keep following up and let you know as soon as there's a response.",
      cta: "View Your Case",
    },
    es: {
      subject: "Actualización sobre su caso de BillFixr",
      heading: "Seguimos esperando a su proveedor",
      body:
        "Seguimos esperando la respuesta de su proveedor sobre {filename}. " +
        "No necesita hacer nada: continuaremos dando seguimiento y le avisaremos en cuanto haya respuesta.",
      cta: "Ver su caso",
    },
  },
};

/**
 * The copy for one email in one language.
 *
 * Falls back to English for any language we have not written, rather than
 * returning an empty string or the message id: an email in the wrong
 * language is recoverable, an email with no words is not.
 */
export function emailCopy(id: MessageId, language: Language): EmailMessage {
  const byLanguage = MESSAGES[id];
  return byLanguage[language] ?? byLanguage[DEFAULT_LANGUAGE];
}

/**
 * Fills {placeholders} in a body.
 *
 * Values are substituted as given. Anything reaching an HTML email must
 * still be escaped by the caller -- this does not escape, because it does
 * not know whether its output is going into HTML or a plain-text part.
 */
export function fillCopy(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole,
  );
}
