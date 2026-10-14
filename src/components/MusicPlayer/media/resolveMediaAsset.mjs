import { mobileMediaHeaders } from "@/utils/mobileMediaPolicy.mjs";

const clientHeaders = () => mobileMediaHeaders(globalThis.navigator, Boolean(globalThis.window?.heykasaDesktop));
const endpoint = "/api/media/resolve";
export async function mediaRequest(body, signal) {
  const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", ...clientHeaders() }, body: JSON.stringify(body), signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.reason || "service_unavailable");
  return result;
}
export function cancelMediaReceipt(receipt) {
  if (!receipt) return;
  void fetch(endpoint, { method: "DELETE", credentials: "same-origin", cache: "no-store", keepalive: true, headers: { "Content-Type": "application/json", ...clientHeaders() }, body: JSON.stringify({ receipt }) }).catch(() => {});
}
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function resolveMediaAsset(request, { signal, receipt, onPending } = {}) {
  const combined = AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(180_000)]);
  let currentReceipt = receipt;
  try {
    let result = await mediaRequest(receipt ? { action: "renew", receipt } : request, combined);
    currentReceipt = result.receipt;
    const started = Date.now();
    while (result.state === "pending") {
      onPending?.(result);
      await delay(Math.min(3000, 1500 + (Date.now() - started) / 30), combined);
      result = await mediaRequest({ action: "poll", receipt: currentReceipt }, combined);
      currentReceipt = result.receipt;
    }
    if (result.state !== "ready" || !result.asset || !currentReceipt) throw new Error(result.reason || "source_unavailable");
    return result;
  } catch (error) {
    cancelMediaReceipt(currentReceipt);
    throw error;
  }
}
