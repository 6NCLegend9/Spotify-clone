"use client";

import { useState } from "react";
import { FiDownload } from "react-icons/fi";

export default function ExportDataButton() {
  const [status, setStatus] = useState("idle");

  const handleExport = async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/account/export");
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "heykasa-data.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleExport}
        disabled={status === "loading"}
        className="btn-ghost h-11 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        <FiDownload aria-hidden="true" />
        {status === "loading" ? "Preparing…" : "Export my data"}
      </button>
      {status === "error" ? (
        <p role="alert" className="mt-2 text-xs text-amber-300">
          Couldn&apos;t export your data. Please try again.
        </p>
      ) : null}
    </div>
  );
}
