import "@testing-library/jest-dom/vitest";

// jsdom lacks scrollIntoView; stub it so Chat's auto-scroll doesn't throw.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
