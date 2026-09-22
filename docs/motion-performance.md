# Motion cleanup and interaction checks

This change removes unused browse-tile, browse-art, page-veil and bottom-sheet selectors, the unused floating-art keyframes, and the unimported `src/utils/motion.js` presets.

Active motion changes:

- Mobile media dragging updates a ref and uses one frame scheduler shared with viewport positioning. Clipping ancestors are cached until geometry invalidation; viewport geometry is read before host style writes. The live iframe remains mounted.
- Bottom sheets stay mounted for their closing transition, cancel interrupted gestures, and preserve focus/scroll ownership when another dialog opens. Reduced-motion preferences bypass closing delays.
- Queue dragging caches row positions and the scroll container. Pointer movement updates a transformed ghost; React updates the drop marker only when its slot changes. Queue changes invalidate an active drag. Remaining rows animate into place after edits, with an accessible status and the existing undo control.
- Entrances use the shared 300ms motion setting. Continuous shadow/text effects and focus-only search spinning are removed. Button/card sheen runs on interaction, and several ambient loops stop on touch-oriented layouts. Reduced-motion and pause-on-scroll safeguards remain.

## Focused component regression check

With normal project dependencies installed, install the optional harness dependencies outside the project:

```sh
npm install --prefix /tmp/haykasa-motion-check --no-save esbuild@0.28.2 jsdom@30.1.1
NODE_PATH=/tmp/haykasa-motion-check/node_modules node scripts/check-motion-interactions.cjs
```

The harness renders the actual components in React/jsdom. External player controls, Next routing, icons and browser geometry are stubbed. It checks cancelled gestures, close/reopen races, focus and scroll restoration, overlapping sheets, final drop coordinates, remote queue changes during dragging, cached measurements, React commits during dragging, viewport clipping and iframe identity. It does not measure real rendering speed or validate CSS appearance.

## Browser verification before release

Run the existing theater-controls Playwright suite against a complete app build. On Android and iOS, check video/audio sheet opening, cancelled and completed drags, reopening, rotation, queue autoscroll and keyboard reordering. Verify OS and in-app reduced-motion settings.

Use the existing bundle analyzer and browser Performance tools to compare drag interactions and long queues. No FPS, loading-time or bundle-size improvement has been claimed from the component checks.
