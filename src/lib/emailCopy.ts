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

type MessageId = "responseReceived" | "closedNoResponse" | "stillWaiting" | "welcome" | "accountDeleted";

const MESSAGES: Record<MessageId, Record<Language, EmailMessage>> = {
  // The first thing we ever send them.
  welcome: {
    en: {
      subject: "Welcome to BillFixr",
      heading: "Welcome to BillFixr",
      body: "Here's how it works, from the bill you upload to the money you keep.",
      cta: "Upload Your Bill",
    },
    es: {
      subject: "Bienvenido a BillFixr",
      heading: "Bienvenido a BillFixr",
      body: "Así funciona, desde la factura que sube hasta el dinero que se ahorra.",
      cta: "Suba su factura",
    },
  },

  // Account closed at their request.
  accountDeleted: {
    en: {
      subject: "Your BillFixr account has been deleted",
      heading: "Your account has been deleted",
      body:
        "Your BillFixr account and the bills stored with it have been permanently removed. " +
        "Nothing of yours remains on our systems.",
      cta: "Visit BillFixr",
    },
    es: {
      subject: "Su cuenta de BillFixr ha sido eliminada",
      heading: "Su cuenta ha sido eliminada",
      body:
        "Su cuenta de BillFixr y las facturas guardadas en ella se eliminaron de forma permanente. " +
        "No queda nada suyo en nuestros sistemas.",
      cta: "Ir a BillFixr",
    },
  },

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

/** The four "how it works" steps in the welcome email. */
export const WELCOME_STEPS: Record<Language, { title: string; description: string }[]> = {
  en: [
    { title: "Upload Your Bill", description: "Upload your medical bill" },
    { title: "We Review & Detect Errors", description: "AI scans for overcharges and hidden fees" },
    { title: "We Negotiate For You", description: "Our experts negotiate with providers" },
    { title: "You Save Money", description: "Receive your reduced bill" },
  ],
  es: [
    { title: "Suba su factura", description: "Suba su factura médica" },
    { title: "Revisamos y detectamos errores", description: "La IA busca cobros excesivos y cargos ocultos" },
    { title: "Negociamos por usted", description: "Nuestro equipo negocia con los proveedores" },
    { title: "Usted ahorra", description: "Reciba su factura reducida" },
  ],
};
