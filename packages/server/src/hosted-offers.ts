// Server-owned hosted offers. The browser may choose an offer id; it cannot
// choose an amount. Prices are CNY minor units and must match Commerce policy.
export type HostedOfferId =
  | "publy-personal-monthly" | "publy-personal-annual"
  | "publy-studio-monthly" | "publy-studio-annual";

export interface HostedOffer {
  plan: "personal" | "studio";
  months: 1 | 12;
  fen: number;
  label: string;
}

export const HOSTED_OFFERS: Readonly<Record<HostedOfferId, HostedOffer>> = Object.freeze({
  "publy-personal-monthly": { plan: "personal", months: 1, fen: 2900, label: "Personal · 1 个月" },
  "publy-personal-annual": { plan: "personal", months: 12, fen: 29000, label: "Personal · 12 个月" },
  "publy-studio-monthly": { plan: "studio", months: 1, fen: 7900, label: "Studio · 1 个月" },
  "publy-studio-annual": { plan: "studio", months: 12, fen: 79000, label: "Studio · 12 个月" },
});

export function isHostedOfferId(value: unknown): value is HostedOfferId {
  return typeof value === "string" && Object.hasOwn(HOSTED_OFFERS, value);
}

export function formatFen(fen: number): string {
  return `¥${(fen / 100).toFixed(fen % 100 === 0 ? 0 : 2)}`;
}
