// Hosted billing-window calculation only. It neither proves entitlement nor
// enables paid admission. Timestamps are trusted server-side UTC milliseconds.
export interface HostedBillingWindow {
  periodStart: number;
  periodEnd: number;
}

/** Return the monthly usage window anchored to the beginning of the paid
 * period. End-of-month anchors clamp in short months without drifting in later
 * months. The final window never extends beyond the verified paid-through time. */
export function hostedBillingWindow(paidFrom: number, paidThrough: number, now: number): HostedBillingWindow {
  if (![paidFrom, paidThrough, now].every(Number.isSafeInteger) || paidFrom < 0 ||
      paidThrough <= paidFrom || now < paidFrom || now >= paidThrough) {
    throw new Error("INVALID_BILLING_WINDOW");
  }
  const anchor = new Date(paidFrom);
  const current = new Date(now);
  const end = new Date(paidThrough);
  if (![anchor, current, end].every((d) => Number.isFinite(d.getTime())) || end.getUTCFullYear() > 9999) {
    throw new Error("INVALID_BILLING_WINDOW");
  }
  const anchorYear = anchor.getUTCFullYear();
  const anchorMonth = anchor.getUTCMonth();
  const anchorDay = anchor.getUTCDate();
  const anniversary = (offset: number): number => {
    const absolute = anchorYear * 12 + anchorMonth + offset;
    const year = Math.floor(absolute / 12), month = absolute % 12;
    // Start from the original time of day, resetting the day before changing
    // month so Date does not roll 31st into the following month.
    const result = new Date(paidFrom);
    result.setUTCDate(1);
    result.setUTCFullYear(year, month + 1, 0);
    const day = Math.min(anchorDay, result.getUTCDate());
    result.setUTCFullYear(year, month, day);
    return result.getTime();
  };
  let offset = (current.getUTCFullYear() - anchorYear) * 12 + current.getUTCMonth() - anchorMonth;
  if (anniversary(offset) > now) offset--;
  const periodStart = anniversary(offset);
  const periodEnd = Math.min(anniversary(offset + 1), paidThrough);
  if (!Number.isSafeInteger(periodStart) || !Number.isSafeInteger(periodEnd) ||
      periodStart < paidFrom || periodStart > now || periodEnd <= now) {
    throw new Error("INVALID_BILLING_WINDOW");
  }
  return { periodStart, periodEnd };
}
