import "@testing-library/jest-dom/vitest";

// jsdom does not implement the browser's native modal-dialog methods.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value() { this.setAttribute("open", ""); } },
  close: { configurable: true, value() { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); } },
});
