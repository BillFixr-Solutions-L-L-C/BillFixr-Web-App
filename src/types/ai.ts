export type AiHealthResponse = {
  status: string;
  environment: string;
  ai_configured: boolean;
  ai_provider: string;
  ai_model: string;
  ocr_enabled: boolean;
  ocr_engine: string;
  database_configured: boolean;
  auth_enabled: boolean;
  malware_scan_enabled: boolean;
  clamav_enabled: boolean;
};

export type AiServiceConfig = {
  baseUrl: string;
  apiKey?: string;
};
