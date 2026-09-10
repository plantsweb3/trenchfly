import { receiptHash, type PublicSession, type SessionDecision } from "./session-state";

export function decisionIdentity(decision?: SessionDecision) {
  return decision ? decision.id ?? `${decision.t}-${decision.symbol}-${decision.proposal}` : "empty";
}

/** Never present a proposal, a paper fill or a referenced receipt as the same event. */
export function decisionOutcome(decision?: SessionDecision) {
  if (!decision) return { kind: "waiting", label: "Waiting for an observation", pressed: false };
  if (decision.result.startsWith("rejected")) return { kind: "rejected", label: "Blocked by execution limits", pressed: false };
  if (decision.result === "paper fill") return { kind: "paper", label: "Paper fill recorded", pressed: true };
  if (receiptHash(decision.result)) return { kind: "receipt", label: "Transaction referenced · check receipt", pressed: true };
  if (decision.proposal === "HOLD") return { kind: "hold", label: "Hold · no order", pressed: false };
  return { kind: "proposal", label: "Proposal only · no fill reported", pressed: false };
}

export function canAutoPlay(feed: PublicSession | null, decision: SessionDecision | undefined, now: number, historical: boolean, unavailable: boolean) {
  if (!feed || !decision || historical || unavailable || feed.status !== "running") return false;
  const age = now - Date.parse(decision.t);
  const snapshotAge = now - Date.parse(feed.updatedAt);
  return age >= 0 && age <= 120_000 && snapshotAge >= 0 && snapshotAge <= 120_000;
}

/** Display scale, not an inferred neuron measurement: a motor-rate band saturating at 400 Hz. */
export function rateIntensity(rate: number | null | undefined) {
  return rate === null || rate === undefined || !Number.isFinite(rate) || rate < 0 ? 0 : Math.min(1, rate / 400);
}
