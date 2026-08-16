import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../lib/runtime";
import { SwapPage } from "./SwapPage";

describe("swap page", () => {
  it("shows the required quote controls and fails closed without Sepolia configuration", () => {
    render(
      <AppProviders>
        <SwapPage />
      </AppProviders>,
    );

    expect(screen.getByLabelText("你支付")).toHaveValue("test-usdt");
    expect(screen.getByLabelText("Test USDT 数量")).toBeInTheDocument();
    expect(screen.getByLabelText("滑点容忍百分比")).toHaveValue("0.5");
    expect(screen.getByRole("button", { name: "等待 YD 与 Sepolia RPC 配置" })).toBeDisabled();
  });

  it("explains that native ETH does not need approval", () => {
    render(
      <AppProviders>
        <SwapPage />
      </AppProviders>,
    );

    fireEvent.change(screen.getByLabelText("你支付"), { target: { value: "sepolia-eth" } });
    expect(screen.getByText("原生 ETH，无需 approve")).toBeInTheDocument();
  });
});
