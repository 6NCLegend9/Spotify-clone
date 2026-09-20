"use client";
import { useEffect, useRef } from "react";
import { createContextGesture } from "@/utils/contextGesture.mjs";

// Reuse the item's visible menu: mouse, touch and keyboard get identical actions.
export default function ContextMenuTarget({ as: Tag = "div", children, ...props }) {
  const root = useRef(null);
  const gesture = useRef(null);
  if (!gesture.current) gesture.current = createContextGesture(() => {
    const button = root.current?.querySelector("[data-item-menu-trigger]:not(:disabled)");
    if (button?.getAttribute("aria-expanded") !== "true") button?.click();
  });
  useEffect(() => () => gesture.current.cancel(), []);
  const excluded = (event) => event.target.closest("input, textarea, select, [contenteditable=true], [role=menu], [role=dialog], [data-item-menu-trigger]");
  const open = (event) => {
    if (excluded(event)) return;
    const trigger = root.current?.querySelector("[data-item-menu-trigger]:not(:disabled)");
    if (!trigger) return;
    event.preventDefault(); event.stopPropagation(); if (trigger.getAttribute("aria-expanded") !== "true") trigger.click();
  };
  return <Tag {...props} ref={root} data-context-target
    onContextMenu={open}
    onKeyDown={(event) => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) open(event); }}
    onPointerDown={(event) => { if (!excluded(event)) gesture.current.down(event); }}
    onPointerMove={(event) => gesture.current.move(event)}
    onPointerUp={() => gesture.current.up()}
    onPointerCancel={() => gesture.current.cancel()}
    onClickCapture={(event) => {
      if (!event.target.closest("[role=menu], [role=dialog], [data-item-menu-trigger]") && gesture.current.consumeClick()) {
        event.preventDefault(); event.stopPropagation();
      }
    }}
  >{children}</Tag>;
}
