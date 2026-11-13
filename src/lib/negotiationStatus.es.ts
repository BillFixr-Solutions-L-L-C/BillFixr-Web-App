import type { AutomationNegotiationStatus } from "@/types/automation-engine";

// What the provider's response means, in Spanish.
//
// This is "the AI communicating the hospital's response to the customer",
// and it is the one place that requirement actually lands: the engine
// decides what the reply MEANS and reduces it to a status, and this is the
// sentence the customer reads about it.
//
// Deliberately a dictionary rather than a translation call. These are a
// closed set of sixteen states, each one a factual claim about where
// someone's medical bill stands and whether they owe money. A model
// translating "You owe nothing" at render time can get it wrong once and
// nobody will ever know; a table cannot. It is also free and instant,
// where a call is neither.
//
// What is NOT translated anywhere, by design:
//   * the hospital's own reply, which stays in the words it was written in
//   * the dispute letters and follow-ups we send, which are English
//   * the corrected bill
// Only our account OF them is translated. See src/lib/language.ts.

export const SUMMARIES_ES: Record<AutomationNegotiationStatus, { label: string; detail: string }> = {
  DISPATCHED: {
    label: "Carta enviada",
    detail: "Escribimos al departamento de facturación del proveedor y esperamos su respuesta.",
  },
  IN_REVIEW: {
    label: "En revisión por el proveedor",
    detail: "El proveedor tiene la disputa y la está revisando.",
  },
  REPLY_RECEIVED: {
    label: "Respuesta recibida",
    detail: "El proveedor respondió. Estamos leyendo su respuesta.",
  },
  COUNTER_OFFER_SENT: {
    label: "Contraoferta enviada",
    detail: "Respondimos a la posición del proveedor y esperamos su respuesta.",
  },
  COUNTER_OFFER_RECEIVED: {
    label: "Contraoferta recibida",
    detail: "El proveedor hizo una oferta. Estamos evaluando si aceptarla o seguir negociando.",
  },
  DISPUTE_ESCALATION: {
    label: "Disputa escalada",
    detail: "El proveedor rechazó la disputa, así que la escalamos con una refutación formal.",
  },
  PROVIDER_NO_ERROR: {
    label: "El proveedor dice que no hay error",
    detail: "El proveedor afirma que la factura es correcta. Estamos preparando el siguiente paso.",
  },
  FINANCIAL_ASSISTANCE_REQUIRED: {
    label: "Se requiere asistencia financiera",
    detail:
      "El proveedor nos remitió a su proceso de asistencia financiera. Es posible que necesitemos algo de usted.",
  },
  ITEMIZED_BILL_RECEIVED: {
    label: "Factura detallada recibida",
    detail: "El proveedor envió la factura línea por línea. La estamos auditando.",
  },
  HIPAA_AUTH_PENDING: {
    label: "Se necesita su autorización",
    detail: "El proveedor exige su autorización por escrito antes de hablar de la factura.",
  },
  HOSPITAL_ACCEPTED: {
    label: "El proveedor aceptó",
    detail: "El proveedor aceptó una reducción. Estamos confirmando las cifras.",
  },
  HELD_FOR_REVIEW: {
    label: "Con nuestro equipo",
    detail: "Un miembro de nuestro equipo revisa este caso antes de enviar el siguiente mensaje.",
  },
  SETTLEMENT_AGREED: {
    label: "Reducción acordada",
    detail: "La reducción está acordada. Pedimos al proveedor la factura corregida.",
  },
  AWAITING_COMPLETION_FEE: {
    label: "Listo para finalizar",
    detail: "Su factura corregida está lista. Se desbloquea al pagar la comisión.",
  },
  COMPLETED: {
    label: "Completado",
    detail: "La factura corregida es suya para descargar.",
  },
  CLOSED_NO_RESPONSE: {
    label: "Cerrado — sin respuesta",
    // "You owe nothing" is the single most consequential sentence in this
    // file. It means the BillFixr fee, not the hospital's bill, and the
    // Spanish says so rather than leaving someone to assume their medical
    // debt has gone away.
    detail:
      "El proveedor nunca respondió, así que cerramos el caso. No nos debe nada más: " +
      "nuestra comisión es una parte de lo que le ahorramos, y no hubo reducción. " +
      "La factura del proveedor sigue vigente.",
  },
};
