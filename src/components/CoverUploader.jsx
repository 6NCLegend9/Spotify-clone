"use client";

import { useRef, useState } from "react";
import { FiImage, FiX } from "react-icons/fi";
import toast from "react-hot-toast";
import { resizeCoverFile } from "@/utils/imageOptimize";
import { humanizeError } from "@/utils/authErrors";

export default function CoverUploader({ value, onChange, disabled }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await resizeCoverFile(file);
      onChange?.(dataUrl);
    } catch (error) {
      toast.error(humanizeError(error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">Cover image</p>
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 overflow-hidden rounded-md bg-white/5">
          {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : (
            <span className="grid h-full w-full place-items-center text-gray-500"><FiImage /></span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
            className="btn-ghost h-9 px-3 text-xs"
          >
            {busy ? "Preparing..." : value ? "Replace image" : "Upload image"}
          </button>
          {value ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange?.("")}
              className="icon-btn h-9 w-9"
              aria-label="Remove cover image"
            >
              <FiX />
            </button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={onFile}
        />
      </div>
      <p className="mt-2 text-[11px] text-gray-500">JPG, PNG, or WebP. We’ll crop to a square and resize it.</p>
    </div>
  );
}
