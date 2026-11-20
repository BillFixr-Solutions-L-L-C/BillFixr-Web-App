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

export type MessageId =
  | "responseReceived"
  | "closedNoResponse"
  | "stillWaiting"
  | "welcome"
  | "accountDeleted"
  // Added 2026-11-19. These three were written as English literals inside
  // their route handlers, so a customer registered in Spanish got them in
  // English -- the profile column was read correctly everywhere it was
  // read, and these three never read it.
  | "letterSent"
  | "supportReply"
  | "supportInProgress"
  | "supportResolved";

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

  // The case has left the building: the appeal letter is with the provider.
  letterSent: {
    en: {
      subject: "Your appeal letter has been sent",
      heading: "Your appeal letter is on its way",
      body: "We've sent your appeal letter to your provider on your behalf. We'll keep following up automatically and let you know as soon as there's a response.",
      cta: "View Your Case",
    },
    es: {
      subject: "Enviamos su carta de reclamación",
      heading: "Su carta de reclamación va en camino",
      body: "Enviamos su carta de reclamación a su proveedor en su nombre. Seguiremos insistiendo automáticamente y le avisaremos en cuanto haya respuesta.",
      cta: "Ver su caso",
    },
  },

  // An agent has written back. The agent's own words are sent as typed --
  // a human wrote them to this customer, and running them through a
  // dictionary would be worse than leaving them alone. What is translated
  // is everything around them.
  supportReply: {
    en: {
      subject: "Re: {subject}",
      heading: "A reply from BillFixr Support",
      body: "You can reply straight to this email and it will reach us.",
      cta: "View Support",
    },
    es: {
      subject: "Re: {subject}",
      heading: "Una respuesta de Soporte de BillFixr",
      body: "Puede responder directamente a este correo y nos llegará.",
      cta: "Ver Soporte",
    },
  },

  supportInProgress: {
    en: {
      subject: "We're looking into your support ticket",
      heading: "We're on it",
      body: 'An agent has picked up your ticket about "{subject}" and is looking into it now.',
      cta: "View Support",
    },
    es: {
      subject: "Estamos revisando su solicitud de soporte",
      heading: "Estamos en ello",
      body: "Un agente ha tomado su solicitud sobre «{subject}» y la está revisando ahora.",
      cta: "Ver Soporte",
    },
  },

  supportResolved: {
    en: {
      subject: "Your support ticket has been resolved",
      heading: "Your ticket has been resolved",
      body: 'Your ticket about "{subject}" has been marked resolved. If you still need help, just send another message from Support.',
      cta: "View Support",
    },
    es: {
      subject: "Su solicitud de soporte se ha resuelto",
      heading: "Su solicitud se ha resuelto",
      body: "Su solicitud sobre «{subject}» se marcó como resuelta. Si todavía necesita ayuda, envíenos otro mensaje desde Soporte.",
      cta: "Ver Soporte",
    },
  },
};

/**
 * "Hi <name>," in the customer's language.
 *
 * Separate from the body copy because the name is interpolated and the
 * punctuation differs. It lived inside caseStatusSync.ts, which meant
 * every other sender either wrote its own English one or did without --
 * and the support emails wrote their own.
 */
export function greeting(name: string | null | undefined, language: Language): string {
  const who = (name ?? "").trim();
  if (language === "es") return who ? `Hola ${who},` : "Hola,";
  return who ? `Hi ${who},` : "Hi there,";
}

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

/** The two prose sections, the button and the sign-off of the welcome
 *  email. Separate from MESSAGES because they do not fit the four-field
 *  EmailMessage shape, and alongside WELCOME_STEPS because they are part
 *  of the same email. */
export const WELCOME_SECTIONS: Record<
  Language,
  { costsTitle: string; costsBody: string; privacyTitle: string; privacyBody: string; support: string; rights: string }
> = {
  en: {
    costsTitle: "What it costs",
    costsBody:
      "A small $5 commitment fee gets your bill into the queue for review right away - it goes toward your final BillFixr fee, so it's never extra. If we find and fix errors, a success fee applies only as a percentage of what you actually save. If no errors are found, that's all you ever pay - no success fee.",
    privacyTitle: "Your documents are private",
    privacyBody:
      "Your bill is only used to review and negotiate on your behalf - it's not shared or sold, and you can see everything we're doing from your dashboard at any time.",
    support: "Questions? Reach us anytime from the Support tab in your dashboard.",
    rights: "Copyright 2026 BillFixr Technologies. All Rights Reserved.",
  },
  es: {
    costsTitle: "Lo que cuesta",
    // The success fee is a percentage of the SAVING, never of the
    // corrected bill. See docs/FEES.md -- the Spanish has to say the same
    // thing, because this is the paragraph someone reads before paying.
    costsBody:
      "Una tarifa de compromiso de $5 pone su factura en la cola de revisión de inmediato, y se descuenta de su tarifa final de BillFixr, así que nunca es un cargo adicional. Si encontramos y corregimos errores, se aplica una comisión por éxito que es solo un porcentaje de lo que usted ahorra. Si no encontramos errores, eso es todo lo que paga: sin comisión por éxito.",
    privacyTitle: "Sus documentos son privados",
    privacyBody:
      "Su factura solo se usa para revisarla y negociar en su nombre; no se comparte ni se vende, y usted puede ver todo lo que hacemos desde su panel en cualquier momento.",
    support: "¿Tiene preguntas? Escríbanos cuando quiera desde la pestaña Soporte de su panel.",
    rights: "Copyright 2026 BillFixr Technologies. Todos los derechos reservados.",
  },
};

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

/** The two emails that go to someone who has no account yet.
 *
 *  A newsletter subscriber and a job applicant have no profile, so there
 *  is no communication_language to read. What there is instead is the
 *  language they were reading the site in when they typed their address,
 *  which the form sends with the request. It is a weaker signal than a
 *  registered preference -- it is whatever the switcher happened to be
 *  on -- but it is a great deal better than assuming English. */
export const PUBLIC_EMAILS: Record<
  Language,
  {
    newsletter: { subject: string; heading: string; body: string; footer: string };
    application: { subject: string; heading: string; body: string };
  }
> = {
  en: {
    newsletter: {
      subject: "You're subscribed to BillFixr",
      heading: "You're on the list",
      body: "Thanks for subscribing. We'll send you occasional updates on medical billing, your rights as a patient, and what BillFixr is working on.",
      footer: "Didn't subscribe? You can safely ignore this email.",
    },
    application: {
      subject: "We received your application",
      heading: "Application received",
      body: "Hi {name}, thanks for applying for {role}. Our team will review your application and reach out if it's a match.",
    },
  },
  es: {
    newsletter: {
      subject: "Se suscribió a BillFixr",
      heading: "Ya está en la lista",
      body: "Gracias por suscribirse. Le enviaremos novedades ocasionales sobre facturación médica, sus derechos como paciente y en qué está trabajando BillFixr.",
      footer: "¿No se suscribió? Puede ignorar este mensaje.",
    },
    application: {
      subject: "Recibimos su solicitud",
      heading: "Solicitud recibida",
      body: "Hola {name}, gracias por postularse para {role}. Nuestro equipo revisará su solicitud y le escribirá si encaja.",
    },
  },
};
