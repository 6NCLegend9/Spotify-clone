export async function resolveParams(params) {
  if (!params) return {};
  return typeof params.then === "function" ? await params : params;
}
