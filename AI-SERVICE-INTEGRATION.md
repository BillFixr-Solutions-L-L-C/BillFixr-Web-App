# AI Service Integration Handoff

This repository now includes the BillFixr AI backend at
`services/ai-service/`.

## What lives where

- `src/`: Next.js web application
- `services/ai-service/`: Python FastAPI service for ingestion, OCR,
  extraction, case analysis, review state, and drafting

## First integration target

Start with the AI service health and case-processing surfaces:

- `GET /health`
- `POST /v1/cases/process`
- `GET /v1/cases/{case_id}/analysis`
- `POST /v1/cases/{case_id}/drafts`

The web app already has a small integration seam:

- `src/lib/ai-service.ts`
- `src/app/api/ai/health/route.ts`

## Environment

Set these in the Next.js runtime when connecting the frontend to the AI
service:

- `AI_SERVICE_BASE_URL`
- `AI_SERVICE_API_KEY` when local API-key auth is enabled in the service

## Recommended merge path

1. Keep this branch as a draft integration branch.
2. Review the Python service placement under `services/ai-service/`.
3. Decide deployment ownership for the AI service before wiring live user
   flows.
4. Replace static dashboard/admin case data with real AI service calls
   incrementally, starting with health and case analysis.
