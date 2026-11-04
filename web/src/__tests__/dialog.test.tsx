// @vitest-environment jsdom
import "../test/setup";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, Dialog } from "../components/ui";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function ReviewDialog({ busy = false }: { busy?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Open review</button>
    {open && <Dialog title="Write a review" onClose={() => setOpen(false)} busy={busy}>
      <label htmlFor="review-body">Your review</label><textarea id="review-body" />
      <Button>Save review</Button>
    </Dialog>}
  </>;
}

describe("shared native dialog", () => {
  it("labels the dialog, focuses its form, and restores the opener after closing", () => {
    render(<ReviewDialog />);
    const opener = screen.getByRole("button", { name: "Open review" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Write a review" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText("Your review")).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("handles the native Escape cancellation event", () => {
    render(<ReviewDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Open review" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dismisses backdrop clicks while keeping clicks inside the dialog open", () => {
    const onClose = vi.fn();
    render(<Dialog title="Book a tour" onClose={onClose}><Button>Reserve seats</Button></Dialog>);
    const dialog = screen.getByRole("dialog");
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({ left: 10, right: 200, top: 10, bottom: 200, width: 190, height: 190, x: 10, y: 10, toJSON: () => ({}) });
    fireEvent.click(dialog, { clientX: 50, clientY: 50 });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog, { clientX: 5, clientY: 5 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("blocks closing, Escape, and backdrop dismissal while a submission is pending", () => {
    const onClose = vi.fn();
    render(<Dialog title="Book a tour" onClose={onClose} busy><Button disabled>Reserving…</Button></Dialog>);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    fireEvent.click(dialog, { clientX: -10, clientY: -10 });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps repeated forward and reverse Tab cycles inside the dialog", () => {
    render(<ReviewDialog />);
    const opener = screen.getByRole("button", { name: "Open review" });
    opener.focus();
    fireEvent.click(opener);
    const first = screen.getByRole("button", { name: "Close dialog" });
    const last = screen.getByRole("button", { name: "Save review" });
    last.focus();
    for (let cycle = 0; cycle < 4; cycle++) {
      expect(fireEvent.keyDown(last, { key: "Tab" })).toBe(false);
      expect(first).toHaveFocus();
      expect(fireEvent.keyDown(first, { key: "Tab", shiftKey: true })).toBe(false);
      expect(last).toHaveFocus();
      expect(opener).not.toHaveFocus();
    }
    fireEvent.click(first);
    expect(opener).toHaveFocus();
  });

  it("leaves ordinary tab movement and other keys to the browser", () => {
    const onClose = vi.fn();
    render(<Dialog title="Review" onClose={onClose}><textarea aria-label="Review text" /><Button>Publish</Button></Dialog>);
    const textarea = screen.getByRole("textbox");
    textarea.focus();
    expect(fireEvent.keyDown(textarea, { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(textarea, { key: "Tab", shiftKey: true })).toBe(true);
    const last = screen.getByRole("button", { name: "Publish" });
    last.focus();
    expect(fireEvent.keyDown(last, { key: "Tab", ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(last, { key: "Enter" })).toBe(true);
    expect(last).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("wraps around visible enabled controls, skipping disabled and hidden controls", () => {
    render(<Dialog title="Choose a tour" onClose={vi.fn()}>
      <Button>Reserve seats</Button>
      <Button disabled>Unavailable</Button>
      <fieldset disabled><input aria-label="Disabled group field" /></fieldset>
      <Button hidden>Hidden attribute</Button>
      <div hidden><Button>Hidden ancestor</Button></div>
      <div style={{ display: "none" }}><Button>Not rendered</Button></div>
      <div style={{ visibility: "hidden" }}><Button>Not visible</Button></div>
      <div inert><Button>Inert option</Button></div>
      <Button tabIndex={-1}>Programmatic focus only</Button>
      <input type="hidden" aria-label="Hidden input" />
    </Dialog>);
    const first = screen.getByRole("button", { name: "Close dialog" });
    const last = screen.getByRole("button", { name: "Reserve seats" });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("uses the dialog as a fallback when busy and all controls are disabled", () => {
    const onClose = vi.fn();
    const view = render(<Dialog title="Reserving a tour" onClose={onClose} busy><Button disabled>Reserving…</Button></Dialog>);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();
    expect(fireEvent.keyDown(dialog, { key: "Tab" })).toBe(false);
    expect(dialog).toHaveFocus();
    expect(fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true })).toBe(false);
    expect(dialog).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
    view.rerender(<Dialog title="Reserving a tour" onClose={onClose}><Button>Done</Button></Dialog>);
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
    screen.getByRole("button", { name: "Done" }).focus();
    fireEvent.keyDown(screen.getByRole("button", { name: "Done" }), { key: "Tab" });
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
  });

  it("respects positive tabindex order at the wrapping boundaries", () => {
    render(<Dialog title="Order controls" onClose={vi.fn()}>
      <input aria-label="Second priority" tabIndex={2} />
      <input aria-label="First priority" tabIndex={1} />
      <Button>Last action</Button>
    </Dialog>);
    const first = screen.getByRole("textbox", { name: "First priority" });
    const last = screen.getByRole("button", { name: "Last action" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });
});
