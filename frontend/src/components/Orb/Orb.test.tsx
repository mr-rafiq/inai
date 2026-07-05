import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Orb from "./Orb";
import type { OrbState } from "../../lib/types";

describe("Orb", () => {
  it.each<OrbState>(["idle", "listening", "thinking", "speaking"])(
    "reflects the %s state for accessibility and animation hooks",
    (state) => {
      render(<Orb state={state} />);
      const orb = screen.getByRole("img");
      expect(orb).toHaveAttribute("data-orb-state", state);
      expect(orb).toHaveAccessibleName(`Assistant is ${state}`);
    },
  );
});
