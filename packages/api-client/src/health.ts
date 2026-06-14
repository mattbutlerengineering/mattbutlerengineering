export interface ServiceHealth {
  readonly status: string;
  readonly version?: string;
  readonly latency?: number;
}

export interface SystemHealth {
  readonly status: string;
  readonly timestamp: string;
  readonly services?: Record<string, ServiceHealth>;
  readonly staticSites?: Record<string, { status: string }>;
  readonly ci?: { status: string };
  readonly deploy?: { status: string };
}
