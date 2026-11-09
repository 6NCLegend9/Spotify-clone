"use client";

import { useId } from "react";
import AccessibleDialog from "@/components/AccessibleDialog";

export default function PlaylistDuplicateDialog({ addition }) {
  const titleId = useId();
  const descriptionId = useId();
  const pending = Boolean(addition.addingId);
  return <AccessibleDialog
    open={Boolean(addition.duplicate)}
    onClose={addition.cancelDuplicate}
    disableClose={pending}
    titleId={titleId}
    describedBy={descriptionId}
    closeLabel="Cancel adding another copy"
    panelClassName="w-full max-w-sm max-h-[min(90dvh,48rem)] overflow-y-auto rounded-xl border border-[var(--hairline)] bg-[var(--navy-raised)] p-5 text-white shadow-2xl"
  >
    <h2 id={titleId} className="text-xl font-bold">Already in playlist</h2>
    <p id={descriptionId} className="mt-3 break-words text-sm text-[var(--muted)]">
      {addition.duplicate?.track?.title || "This song"} is already in {addition.duplicate?.playlist?.name || "this playlist"}. Add another copy?
    </p>
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      <button type="button" disabled={pending} onClick={addition.cancelDuplicate}
        className="min-h-11 rounded-full px-4 py-2 font-semibold hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50">Cancel</button>
      <button type="button" disabled={pending} onClick={() => void addition.confirmDuplicate()}
        className="min-h-11 rounded-full bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--play-ink)] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-50">
        {pending ? "Adding…" : "Add another copy"}
      </button>
    </div>
  </AccessibleDialog>;
}
