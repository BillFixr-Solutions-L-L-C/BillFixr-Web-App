import { getAiServiceConfig, getAiHealth, findProviderContact as aiServiceContact } from "./ai-service";
import {
  getAutomationEngineConfig,
  getEngineHealth,
  findProviderContact as engineContact,
} from "./automation-engine";

// One seam over the two Python services under services/.
//
// They arrived from different workstreams and overlap: both expose a
// health check and a provider-contact lookup, each behind its own base
// URL. Rather than make every caller pick, this module answers "what is
// configured", "is it reachable" and "find this hospital's billing
// contacts" once, and the rest of the app stops caring which backend
// happens to be deployed.
//
// What is NOT unified: the work each service alone does — ai-service's
// document processing (/v1/cases/process) and the engine's audit and
// negotiation lifecycle. Those are different jobs, not two spellings of
// one, so they keep their own clients.

export type AiBackend = "automation-engine" | "ai-service";

// The engine is asked first wherever both can answer. Its contact lookup
// is backed by a real provider directory and returns a verification
// status; ai-service's equivalent is a documented stub that 404s until
// that workstream ships the endpoint.
const PREFERENCE: AiBackend[] = ["automation-engine", "ai-service"];

export function isBackendConfigured(backend: AiBackend): boolean {
  return backend === "automation-engine"
    ? getAutomationEngineConfig() !== null
    : getAiServiceConfig() !== null;
}

export function configuredBackends(): AiBackend[] {
  return PREFERENCE.filter(isBackendConfigured);
}

/** The backend that should answer a request both can serve, or null if neither is set up. */
export function preferredBackend(): AiBackend | null {
  return configuredBackends()[0] ?? null;
}

export type BackendHealth = {
  backend: AiBackend;
  configured: boolean;
  /** False when configured but unreachable. Null when it was never asked. */
  reachable: boolean | null;
  detail: Record<string, unknown> | null;
};

// Each backend is reported separately and a failure in one never masks
// the other: an admin needs to see which half of the stack is down, not
// a single red light.
export async function getStackHealth(): Promise<BackendHealth[]> {
  return Promise.all(
    PREFERENCE.map(async (backend): Promise<BackendHealth> => {
      if (!isBackendConfigured(backend)) {
        return { backend, configured: false, reachable: null, detail: null };
      }
      try {
        const detail = backend === "automation-engine" ? await getEngineHealth() : await getAiHealth();
        return { backend, configured: true, reachable: true, detail: detail as Record<string, unknown> };
      } catch (error) {
        console.error(`${backend} health check failed:`, error);
        return { backend, configured: true, reachable: false, detail: null };
      }
    }),
  );
}

export type ProviderContact = {
  billing_email: string | null;
  support_email: string | null;
  phone: string | null;
  /** Only the engine reports this; ai-service answers carry null. */
  verification_status: "verified" | "listed" | "unverified" | null;
  /** Which backend actually answered, so a caller can say where a value came from. */
  source: AiBackend;
};

/**
 * Looks a hospital's billing contacts up through whichever backend is
 * configured, preferring the engine. Throws if neither is configured, so
 * a caller can tell "not set up" apart from "looked and found nothing" —
 * the difference between asking the customer to type it in and telling
 * them there is nothing to find.
 */
export async function findProviderContact(provider: {
  name: string;
  address?: string | null;
}): Promise<ProviderContact> {
  const backend = preferredBackend();
  if (!backend) {
    throw new Error("No AI backend is configured. Set AUTOMATION_ENGINE_BASE_URL or AI_SERVICE_BASE_URL.");
  }

  if (backend === "automation-engine") {
    const contact = await engineContact(provider);
    return {
      billing_email: contact.billing_email,
      support_email: contact.support_email,
      phone: contact.phone,
      verification_status: contact.verification_status,
      source: backend,
    };
  }

  const contact = await aiServiceContact(provider);
  return {
    billing_email: contact.billing_email,
    support_email: contact.support_email,
    phone: contact.phone,
    verification_status: null,
    source: backend,
  };
}
