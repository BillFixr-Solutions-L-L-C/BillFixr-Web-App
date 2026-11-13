import type { Language } from "@/lib/language";

// Every string the customer-facing site shows, in both languages.
//
// A hand-rolled dictionary rather than next-intl or react-i18next, for two
// reasons. This app is deliberately built without a component library --
// see docs/FRONTEND-CONVENTIONS.md -- and the obvious framework choice
// wants locale-prefixed routes, which would mean restructuring every page
// in src/app into a [locale] segment to solve a problem a cookie already
// solves. Two languages and a flat key space do not need more than this.
//
// Keys are grouped by where they appear. A key is never reused across two
// places that merely happen to share an English word: "Save" on a form and
// "Save" meaning money are different strings, and in Spanish they are
// "Guardar" and "Ahorrar".
//
// Admin screens are NOT here. They are staff-facing and stay English.

export const MESSAGES = {
  en: {
    // --- language switcher ---
    "lang.label": "Language",
    "lang.en": "English",
    "lang.es": "Español",

    // --- landing ---
    "home.eyebrow": "AI-POWERED MEDICAL BILLS REVIEW",
    "home.headline": "Take Control of Your Medical Bills-",
    "home.headlineAccent": "Automatically",
    "home.sub": "Reduce your cost with AI-powered bill negotiation",
    "home.cta": "Upload Your Bill",
    "home.howItWorks": "How it works",
    "home.step1": "Upload Your Bill",
    "home.step1Body": "Upload your medical bill",
    "home.step2": "We Review & Detect Errors",
    "home.step2Body": "AI scans for overcharges and hidden fees",
    "home.step3": "We Negotiate For You",
    "home.step3Body": "Our experts negotiate with providers.",
    "home.step4": "You Save Money",
    "home.step4Body": "Receive your reduced bill",
    "home.whyChooseUs": "Why choose us",
    "home.whyBody1": "Medical bills can be overwhelming, confusing, and financially draining.",
    "home.whyBody2": "BillFixr was created to provide a simple, automated, and stress-free way to reduce your medical bills, without requiring you to make calls, argue with billing departments, or navigate complicated insurance processes.",
    "home.ctaLine1": "Billing as relief.",
    "home.ctaLine2": "Not a burden.",
    "home.beforeHeading": "Before you pay, let BillFixr read it",
    "home.beforeSub": "Because bills shouldn't come as a burden.",
    "home.reviewYourBill": "Review Your Bill",
    "home.contactUs": "Contact us",
    "home.mailingList": "Join Our Mailing List",

    // --- auth ---
    "auth.signIn": "Sign in",
    "auth.signUp": "Create account",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.name": "Full name",
    "auth.forgot": "Forgot your password?",
    "auth.noAccount": "Don't have an account?",
    "auth.haveAccount": "Already have an account?",
    "auth.checkEmail": "Check your email",
    "auth.checkEmailBody": "We've sent you a link to confirm your address.",

    "auth.logIn": "Log in",
    "auth.loggingIn": "Logging in…",
    "auth.signUpCta": "Sign up",
    "auth.creating": "Creating account…",
    "auth.fullName": "Full Name",
    "auth.confirmPassword": "Confirm Password",
    // --- dashboard shell ---
    "nav.dashboard": "Dashboard",
    "nav.documents": "My Document",
    "nav.activeCase": "Active Case",
    "nav.completedCase": "Completed Case",
    "nav.support": "Support",
    "nav.settings": "Settings",
    "nav.logout": "Log out",

    // --- upload flow ---
    "upload.welcome": "Welcome",
    "upload.welcomeSub": "This will take about two minutes. We'll look at your bill together",
    "upload.chooseFile": "Choose a file",
    "upload.dropHint":
      "Drag and drop your files, or click here to choose from your device. Supported files includes Jpeg, png, doc, pdf. Max 10MB — select multiple photos for a multi-page bill.",
    "upload.cta": "Upload Your Bill",
    "upload.preparing": "Preparing your file…",
    "upload.uploading": "File Uploading",
    "upload.readyForScan": "Ready for scan",
    "upload.readyBody": "Your medical bill is ready for scan now, click the button below",
    "upload.scanNow": "Scan now",
    "upload.analyzing": "Analyzing your bill — this can take a moment...",
    "upload.readingDetails": "Reading the details of your bill…",
    "upload.agree": "I Agree",

    // --- stats ---
    "stats.billAnalyzed": "Bill Analyzed",
    "stats.savingsFound": "Savings Found",
    "stats.errorsDetected": "Errors Detected",
    "stats.appealGenerated": "Appeal Generated",

    // --- bill table ---
    "table.bill": "Bill",
    "table.provider": "Provider",
    "table.uploadDate": "Upload Date",
    "table.status": "Status",
    "table.errors": "Errors",
    "table.savings": "Savings",
    "table.negotiating": "Negotiating",
    "table.errorsFound": "{count} found",

    // --- information step ---
    "info.personal": "Personal Information",
    "info.hospital": "Hospital Information",
    "info.clientName": "Client Name",
    "info.email": "Email",
    "info.address": "Address",
    "info.clientHospitalNumber": "Client Hospital Account Number",
    "info.hospitalName": "Hospital Name",
    "info.billingManagerEmail": "Billing Department Email",
    "info.hospitalAddress": "Hospital Address",
    "info.supportEmail": "Hospital Support Email",
    "info.billingPhone": "Billing Phone Number",
    "info.edit": "Edit",
    "info.save": "Save",
    "info.saving": "Saving…",
    "info.saveInformation": "Save Information",
    "info.saved": "Information saved.",
    "info.searchByAi": "Search by AI",
    "info.searching": "Searching…",

    // --- payment ---
    "pay.commitmentFee": "Commitment fee",
    "pay.proceed": "Proceed to Payment",
    "pay.confirm": "Confirm Payment",
    "pay.processing": "Processing…",
    "pay.confirming": "Confirming your payment…",
    "pay.secure": "Payments are encrypted and securely processed",
    "pay.feePrompt": "Proceed to make your commitment fee while your document is being scanned",

    // --- active case ---
    "case.title": "Active Case",
    "case.response": "Response",
    "case.pending": "Pending",
    "case.received": "Received",
    "case.letterSent": "Sent",
    "case.letterNotSent": "Not sent",
    "case.originalBill": "Original Bill",
    "case.adjustedBill": "Adjusted Bill",
    "case.unlockedOnPayment": "Unlocked once payment is complete",
    "case.noPreview": "No preview available",
    "case.viewCase": "View Your Case",
    "case.negotiationStarted":
      "Your errors have been found and negotiation has started. Track the response and next steps from your Active Case.",

    "case.notYetAvailable": "Not yet available",
    "case.originalUnavailable": "Original bill file unavailable",
    "case.availableAfterPayment": "Available from Completed Case once payment is complete",
    "pay.successFee": "Success fee",
    "pay.failed": "Payment failed. Please try again.",
    // --- documents / completed / support ---
    "docs.title": "My Documents",
    "docs.document": "Document",
    "docs.date": "Date",
    "docs.view": "View",
    "completed.title": "Completed Case",
    "completed.appealLetter": "Appeal Letter",
    "completed.proposedSavings": "Proposed Savings",
    "completed.completed": "Completed",
    "support.title": "Support",
    "support.selectComplaint": "Select your complain",
    "support.message": "Message",
    "support.noConversations": "No past conversations yet.",
    "support.conversationEnded": "This conversation has ended.",
    // --- generic ---
    "common.continue": "Continue",
    "common.close": "Close",
    "common.download": "Download as PDF",
    "common.loading": "Loading…",
    "common.tryAgain": "Please try again.",
  },

  es: {
    "lang.label": "Idioma",
    "lang.en": "English",
    "lang.es": "Español",

    // --- landing ---
    "home.eyebrow": "REVISIÓN DE FACTURAS MÉDICAS CON IA",
    "home.headline": "Tome el control de sus facturas médicas,",
    "home.headlineAccent": "automáticamente",
    "home.sub": "Reduzca su costo con negociación de facturas asistida por IA",
    "home.cta": "Suba su factura",
    "home.howItWorks": "Cómo funciona",
    "home.step1": "Suba su factura",
    "home.step1Body": "Suba su factura médica",
    "home.step2": "Revisamos y detectamos errores",
    "home.step2Body": "La IA busca cobros excesivos y cargos ocultos",
    "home.step3": "Negociamos por usted",
    "home.step3Body": "Nuestro equipo negocia con los proveedores.",
    "home.step4": "Usted ahorra",
    "home.step4Body": "Reciba su factura reducida",
    "home.whyChooseUs": "Por qué elegirnos",
    "home.whyBody1": "Las facturas médicas pueden ser abrumadoras, confusas y costosas.",
    "home.whyBody2": "BillFixr nació para reducir sus facturas médicas de forma sencilla y automática, sin que usted tenga que llamar, discutir con el departamento de facturación ni lidiar con trámites complicados del seguro.",
    "home.ctaLine1": "La facturación como alivio.",
    "home.ctaLine2": "No como una carga.",
    "home.beforeHeading": "Antes de pagar, deje que BillFixr la revise",
    "home.beforeSub": "Porque una factura no debería ser una carga.",
    "home.reviewYourBill": "Revise su factura",
    "home.contactUs": "Contáctenos",
    "home.mailingList": "Únase a nuestra lista de correo",

    "auth.signIn": "Iniciar sesión",
    "auth.signUp": "Crear cuenta",
    "auth.email": "Correo electrónico",
    "auth.password": "Contraseña",
    "auth.name": "Nombre completo",
    "auth.forgot": "¿Olvidó su contraseña?",
    "auth.noAccount": "¿No tiene una cuenta?",
    "auth.haveAccount": "¿Ya tiene una cuenta?",
    "auth.checkEmail": "Revise su correo",
    "auth.checkEmailBody": "Le enviamos un enlace para confirmar su dirección.",

    "auth.logIn": "Iniciar sesión",
    "auth.loggingIn": "Iniciando sesión…",
    "auth.signUpCta": "Registrarse",
    "auth.creating": "Creando la cuenta…",
    "auth.fullName": "Nombre completo",
    "auth.confirmPassword": "Confirme la contraseña",
    "nav.dashboard": "Panel",
    "nav.documents": "Mis documentos",
    "nav.activeCase": "Caso activo",
    "nav.completedCase": "Casos cerrados",
    "nav.support": "Ayuda",
    "nav.settings": "Configuración",
    "nav.logout": "Cerrar sesión",

    "upload.welcome": "Bienvenido",
    "upload.welcomeSub": "Esto toma unos dos minutos. Revisaremos su factura juntos",
    "upload.chooseFile": "Elija un archivo",
    "upload.dropHint":
      "Arrastre y suelte sus archivos, o haga clic aquí para elegirlos desde su dispositivo. Se aceptan Jpeg, png, doc y pdf. Máximo 10 MB: seleccione varias fotos para una factura de varias páginas.",
    "upload.cta": "Suba su factura",
    "upload.preparing": "Preparando su archivo…",
    "upload.uploading": "Subiendo el archivo",
    "upload.readyForScan": "Lista para analizar",
    "upload.readyBody": "Su factura médica está lista para analizarse; haga clic en el botón de abajo",
    "upload.scanNow": "Analizar ahora",
    "upload.analyzing": "Analizando su factura: esto puede tardar un momento...",
    "upload.readingDetails": "Leyendo los datos de su factura…",
    "upload.agree": "Acepto",

    "stats.billAnalyzed": "Facturas analizadas",
    "stats.savingsFound": "Ahorro encontrado",
    "stats.errorsDetected": "Errores detectados",
    "stats.appealGenerated": "Reclamaciones generadas",

    "table.bill": "Factura",
    "table.provider": "Proveedor",
    "table.uploadDate": "Fecha de subida",
    "table.status": "Estado",
    "table.errors": "Errores",
    "table.savings": "Ahorro",
    "table.negotiating": "Negociando",
    "table.errorsFound": "{count} encontrados",

    "info.personal": "Información personal",
    "info.hospital": "Información del hospital",
    "info.clientName": "Nombre del cliente",
    "info.email": "Correo electrónico",
    "info.address": "Dirección",
    "info.clientHospitalNumber": "Número de cuenta en el hospital",
    "info.hospitalName": "Nombre del hospital",
    "info.billingManagerEmail": "Correo del departamento de facturación",
    "info.hospitalAddress": "Dirección del hospital",
    "info.supportEmail": "Correo de atención del hospital",
    "info.billingPhone": "Teléfono de facturación",
    "info.edit": "Editar",
    "info.save": "Guardar",
    "info.saving": "Guardando…",
    "info.saveInformation": "Guardar información",
    "info.saved": "Información guardada.",
    "info.searchByAi": "Buscar con IA",
    "info.searching": "Buscando…",

    "pay.commitmentFee": "Cuota de compromiso",
    "pay.proceed": "Ir al pago",
    "pay.confirm": "Confirmar pago",
    "pay.processing": "Procesando…",
    "pay.confirming": "Confirmando su pago…",
    "pay.secure": "Los pagos se cifran y se procesan de forma segura",
    "pay.feePrompt": "Realice su cuota de compromiso mientras analizamos su documento",

    "case.title": "Caso activo",
    "case.response": "Respuesta",
    "case.pending": "Pendiente",
    "case.received": "Recibida",
    "case.letterSent": "Enviada",
    "case.letterNotSent": "Sin enviar",
    "case.originalBill": "Factura original",
    "case.adjustedBill": "Factura ajustada",
    "case.unlockedOnPayment": "Se desbloquea al completar el pago",
    "case.noPreview": "Vista previa no disponible",
    "case.viewCase": "Ver su caso",
    "case.negotiationStarted":
      "Encontramos los errores y comenzó la negociación. Siga la respuesta y los próximos pasos desde su Caso activo.",

    "case.notYetAvailable": "Aún no disponible",
    "case.originalUnavailable": "El archivo de la factura original no está disponible",
    "case.availableAfterPayment": "Disponible en Casos cerrados cuando se complete el pago",
    "pay.successFee": "Comisión por resultado",
    "pay.failed": "El pago falló. Inténtelo de nuevo.",
    // --- documents / completed / support ---
    "docs.title": "Mis documentos",
    "docs.document": "Documento",
    "docs.date": "Fecha",
    "docs.view": "Ver",
    "completed.title": "Casos cerrados",
    "completed.appealLetter": "Carta de reclamación",
    "completed.proposedSavings": "Ahorro propuesto",
    "completed.completed": "Completado",
    "support.title": "Ayuda",
    "support.selectComplaint": "Seleccione su consulta",
    "support.message": "Mensaje",
    "support.noConversations": "Aún no hay conversaciones.",
    "support.conversationEnded": "Esta conversación ha terminado.",
    "common.continue": "Continuar",
    "common.close": "Cerrar",
    "common.download": "Descargar en PDF",
    "common.loading": "Cargando…",
    "common.tryAgain": "Inténtelo de nuevo.",
  },
} as const satisfies Record<Language, Record<string, string>>;

export type MessageKey = keyof (typeof MESSAGES)["en"];

/**
 * One string, in one language.
 *
 * Falls back to English for a key a language has not been given, and to
 * the key itself if it exists in neither. Returning the key is loud and
 * obviously wrong on screen, which is what you want from a missing
 * translation -- an empty string is a hole nobody notices.
 */
export function translate(
  language: Language,
  key: MessageKey,
  values?: Record<string, string | number>,
): string {
  const table = MESSAGES[language] as Record<string, string>;
  const english = MESSAGES.en as Record<string, string>;
  const text = table?.[key] ?? english[key] ?? key;
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole,
  );
}
