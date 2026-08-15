import { describe, expect, it } from "vitest";
import { initialPurchaseState, purchaseReducer } from "./purchase-machine";

describe("purchaseReducer", () => {
  it("requires an exact confirmed approval before a purchase can begin", () => {
    const withWrongAllowance = purchaseReducer(initialPurchaseState, {
      type: "START_APPROVAL",
      amount: "49",
    });
    const confirmed = purchaseReducer(withWrongAllowance, {
      type: "APPROVAL_CONFIRMED",
      amount: "49",
    });

    expect(purchaseReducer(confirmed, { type: "START_PURCHASE", price: "50" })).toEqual(confirmed);
    expect(purchaseReducer(confirmed, { type: "START_PURCHASE", price: "49" }).phase).toBe(
      "purchasing",
    );
  });

  it("makes failures recoverable without retaining an authorization claim", () => {
    const approving = purchaseReducer(initialPurchaseState, {
      type: "START_APPROVAL",
      amount: "50",
    });
    const failed = purchaseReducer(approving, {
      type: "FAILED",
      message: "Wallet rejected the request.",
    });

    expect(failed).toMatchObject({ phase: "failed", approvedAmount: "50" });
    expect(purchaseReducer(failed, { type: "RETRY" })).toEqual(initialPurchaseState);
  });
});
