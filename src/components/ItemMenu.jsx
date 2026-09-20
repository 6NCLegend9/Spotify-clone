"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiMoreHorizontal } from "react-icons/fi";
import { placeAnchoredMenu } from "@/utils/anchoredMenu.mjs";

export default function ItemMenu({ label = "Item options", actions = [], className = "" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef(null), menu = useRef(null);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition(placeAnchoredMenu({
        trigger: rect,
        menuHeight: menu.current?.offsetHeight || 200,
        menuWidth: menu.current?.offsetWidth || 240,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, error]);

  useLayoutEffect(() => {
    if (!open) return;
    menu.current?.querySelector("button:not(:disabled)")?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event) => { if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <>
    <button ref={trigger} data-item-menu-trigger type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-gray-300 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${className}`}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); setError(""); setOpen((value) => !value); }}><FiMoreHorizontal aria-hidden="true" /></button>
    {open && createPortal(<div ref={menu} role="menu" aria-label={label} data-item-actions-menu="true"
      style={{ position: "fixed", ...position, width: "min(240px, calc(100vw - 16px))" }}
      className="z-[10000] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-xl border border-white/15 bg-[#111d28] p-1.5 text-sm text-white shadow-2xl"
      onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
        if (event.key === "Tab") { setOpen(false); return; }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...menu.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
      {actions.filter(Boolean).map((action) => <button key={action.label} type="button" role="menuitem" disabled={busy || action.disabled}
        className={`flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-left hover:bg-white/10 focus:bg-white/10 focus:outline-none disabled:opacity-40 ${action.destructive ? "text-red-300" : ""}`}
        onClick={async () => { setBusy(true); setError(""); try { await action.onSelect(); close(); } catch (cause) { setError(cause?.message || "Could not save the change. Try again."); } finally { setBusy(false); } }}>
        {action.label}
      </button>)}
      {error && <p role="alert" className="p-3 text-xs text-red-300">{error}</p>}
    </div>, document.body)}
  </>;
}
