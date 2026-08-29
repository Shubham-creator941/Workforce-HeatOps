export type ProviderErrorKind =
  | "CONFIGURATION"
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "UPSTREAM"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "MISSING_DATA"
  | "TEMPORAL_ALIGNMENT";

export class ProviderError extends Error {
  constructor(
    public readonly provider: "FORTYGUARD" | "OPEN_METEO",
    public readonly kind: ProviderErrorKind,
  ) {
    super(`${provider}_${kind}`);
  }
}

export function providerKindForStatus(status: number): ProviderErrorKind {
  if (status === 400 || status === 422) return "INVALID_REQUEST";
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  if (status === 429) return "RATE_LIMITED";
  return "UPSTREAM";
}
