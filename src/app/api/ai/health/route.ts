import { NextResponse } from "next/server";

import { getAiHealth, getAiServiceConfig } from "@/lib/ai-service";

export async function GET() {
  if (!getAiServiceConfig()) {
    return NextResponse.json(
      {
        error: "AI service is not configured.",
        detail: "Set AI_SERVICE_BASE_URL to enable backend health checks.",
      },
      { status: 503 },
    );
  }

  try {
    const health = await getAiHealth();
    return NextResponse.json(health);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to reach the AI service.",
        detail: error instanceof Error ? error.message : "Unknown AI service error.",
      },
      { status: 502 },
    );
  }
}
