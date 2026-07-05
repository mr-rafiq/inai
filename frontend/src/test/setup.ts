import "@testing-library/jest-dom/vitest";

// jsdom lacks scrollIntoView; stub it so Chat's auto-scroll doesn't throw.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom has no WebGL — return null quietly so Orb picks its CSS fallback
// without the "Not implemented" console noise.
HTMLCanvasElement.prototype.getContext = (() => null) as never;
