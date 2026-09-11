"use client";

import { useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { clearDiagnostics, diagnosticSnapshot } from "@/utils/diagnostics.mjs";

export default function SupportDiagnostics() {
  const [report, setReport] = useState(null);
  const refresh = () => setReport(diagnosticSnapshot());
  return <details className="border-y border-[var(--hairline)] py-5" onToggle={(event) => { if (event.currentTarget.open) refresh(); }}>
    <summary className="min-h-12 cursor-pointer py-3 text-base font-semibold">Support diagnostics</summary>
    {report && <>
      <pre aria-label="Diagnostic report preview" className="my-4 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border border-[var(--hairline)] p-3 text-xs text-[var(--muted)]">{JSON.stringify(report, null, 2)}</pre>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-ghost min-h-12 gap-2 px-4" onClick={refresh}><RefreshCw size={18} aria-hidden="true" />Refresh</button>
        <button type="button" className="btn-ghost min-h-12 gap-2 px-4" onClick={() => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
          const link = document.createElement("a"); link.href = url; link.download = "heykasa-diagnostics.json"; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}><Download size={18} aria-hidden="true" />Download report</button>
        <button type="button" className="btn-ghost min-h-12 px-4" onClick={() => { clearDiagnostics(); refresh(); }}>Clear report</button>
      </div>
    </>}
  </details>;
}