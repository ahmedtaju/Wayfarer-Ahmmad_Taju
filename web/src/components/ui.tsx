"use client";

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Compass, SearchX, Star, X } from "lucide-react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

export function Button({ variant = "primary", type = "button", className = "", ...props }: ButtonProps) {
  return <button type={type} className={`button button--${variant} ${className}`} {...props} />;
}

export function StatusPanel({ title, children, action, tone = "info" }: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  tone?: "error" | "empty" | "info" | "success";
}) {
  const Icon = { error: CircleAlert, empty: SearchX, info: Compass, success: CheckCircle2 }[tone];
  return (
    <section className={`status-panel status-panel--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="status-icon"><Icon size={24} aria-hidden="true" /></span>
      <div><h2>{title}</h2><div className="status-copy">{children}</div>{action && <div className="status-action">{action}</div>}</div>
    </section>
  );
}

export function Rating({ average, count }: { average: number | null; count: number }) {
  const reviews = `${count} ${count === 1 ? "review" : "reviews"}`;
  return (
    <span className="rating" role="img" aria-label={average === null ? "No reviews yet" : `${average.toFixed(1)} out of 5 stars from ${reviews}`}>
      <Star size={16} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
      <strong>{average === null ? "New" : average.toFixed(1)}</strong><span>{average === null ? "No reviews yet" : `(${reviews})`}</span>
    </span>
  );
}

function dialogFocusTargets(dialog: HTMLDialogElement): HTMLElement[] {
  const selector = "a[href], area[href], button, input:not([type='hidden']), select, textarea, summary, [tabindex], [contenteditable]:not([contenteditable='false'])";
  return Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter((element) => {
    if (element.tabIndex < 0 || element.matches(":disabled") || element.closest("[hidden], [inert]")) return false;
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = window.getComputedStyle(ancestor);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.contentVisibility === "hidden") return false;
      if (ancestor === dialog) break;
    }
    return true;
  }).sort((a, b) => {
    // Positive tabindex values precede the normal document-order tab stops.
    const orderA = a.tabIndex > 0 ? a.tabIndex : Number.POSITIVE_INFINITY;
    const orderB = b.tabIndex > 0 ? b.tabIndex : Number.POSITIVE_INFINITY;
    return orderA === orderB ? 0 : orderA - orderB;
  });
}

export function Dialog({ title, children, onClose, busy = false }: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    const targets = dialogFocusTargets(dialog);
    const initial = targets.find((element) => element.hasAttribute("autofocus"))
      ?? targets.find((element) => element.matches("input, textarea, select, button:not([data-dialog-close])"))
      ?? targets[0] ?? dialog;
    initial.focus();
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog ref={dialogRef} className="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Tab" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
        const dialog = event.currentTarget;
        const targets = dialogFocusTargets(dialog);
        const first = targets[0];
        const last = targets.at(-1);
        if (!first || !last) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        const focused = document.activeElement;
        if (!targets.includes(focused as HTMLElement) || (event.shiftKey ? focused === first : focused === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => {
        if (busy || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}>
      <div className="dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" type="button" aria-label="Close dialog" data-dialog-close disabled={busy} onClick={onClose}><X size={22} aria-hidden="true" /></button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
