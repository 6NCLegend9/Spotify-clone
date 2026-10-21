const endpoint = "/api/media/resolve";
export async function mediaRequest(body, signal) {
  const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.reason || "service_unavailable");
  return result;
}
export function cancelMediaReceipt(receipt) {
  if (!receipt) return;
  void fetch(endpoint, { method: "DELETE", credentials: "same-origin", cache: "no-store", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receipt }) }).catch(() => {});
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
  // Older Android System WebViews support AbortController but not AbortSignal.any.
  // Keep cancellation and the preparation deadline without requiring newer APIs.
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const deadline = setTimeout(() => controller.abort(new DOMException("Media preparation timed out", "TimeoutError")), 270_000);
  const combined = controller.signal;
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
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", abort);
  }
}
