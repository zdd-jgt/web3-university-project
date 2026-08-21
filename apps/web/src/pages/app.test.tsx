import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../lib/runtime";
import { Courses } from "./app";

describe("course catalog", () => {
  it("offers a labelled filter and exposes course destinations", () => {
    render(
      <MemoryRouter>
        <AppProviders>
          <Courses />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("按级别筛选")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Solidity 基础" })).toHaveAttribute(
      "href",
      "/courses/solidity-basics",
    );
  });
});
