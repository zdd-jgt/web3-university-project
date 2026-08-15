export type PurchasePhase =
  | "idle"
  | "approving"
  | "readyToBuy"
  | "purchasing"
  | "complete"
  | "failed";

export type PurchaseState = {
  phase: PurchasePhase;
  approvedAmount: string | null;
  error: string | null;
};

export type PurchaseEvent =
  | { type: "START_APPROVAL"; amount: string }
  | { type: "APPROVAL_CONFIRMED"; amount: string }
  | { type: "START_PURCHASE"; price: string }
  | { type: "PURCHASE_CONFIRMED" }
  | { type: "FAILED"; message: string }
  | { type: "RETRY" };

export const initialPurchaseState: PurchaseState = {
  phase: "idle",
  approvedAmount: null,
  error: null,
};

/** UI-only guard. The contract remains the authority for price, allowance and sale state. */
export function purchaseReducer(state: PurchaseState, event: PurchaseEvent): PurchaseState {
  switch (event.type) {
    case "START_APPROVAL":
      return state.phase === "idle" || state.phase === "failed"
        ? { phase: "approving", approvedAmount: event.amount, error: null }
        : state;
    case "APPROVAL_CONFIRMED":
      return state.phase === "approving" && state.approvedAmount === event.amount
        ? { phase: "readyToBuy", approvedAmount: event.amount, error: null }
        : state;
    case "START_PURCHASE":
      return state.phase === "readyToBuy" && state.approvedAmount === event.price
        ? { ...state, phase: "purchasing" }
        : state;
    case "PURCHASE_CONFIRMED":
      return state.phase === "purchasing" ? { ...state, phase: "complete" } : state;
    case "FAILED":
      return { ...state, phase: "failed", error: event.message };
    case "RETRY":
      return state.phase === "failed" ? initialPurchaseState : state;
  }
}
