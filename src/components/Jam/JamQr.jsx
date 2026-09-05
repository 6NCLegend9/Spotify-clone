"use client";

import { useEffect, useState } from "react";

export default function JamQr({ url, label = "Jam QR code" }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc("");
    setFailed(false);
    if (!url) return () => {
      cancelled = true;
    };

    import("qrcode")
      .then(({ toDataURL }) => toDataURL(url, {
        width: 220,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#00e6e6ff", light: "#07121dff" },
      }))
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url) return null;
  if (failed) {
    return (
      <p className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-xs text-red-200">
        QR code unavailable. Copy the Jam link instead.
      </p>
    );
  }
  if (!src) {
    return <div className="mx-auto h-44 w-44 animate-pulse rounded-xl bg-white/5" aria-label="Generating QR code" />;
  }

  return (
    <img
      data-testid="jam-qr"
      src={src}
      alt={label}
      width={180}
      height={180}
      className="mx-auto h-44 w-44 rounded-xl border border-white/10 bg-[#07121d] p-2"
    />
  );
}
