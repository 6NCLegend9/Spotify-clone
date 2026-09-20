import { AsyncLocalStorage } from 'node:async_hooks';
import { logServerDiagnostic } from './diagnostics.mjs';

const context = new AsyncLocalStorage();
export function withProviderRequest(requestId, operation) {
  return context.run({ requestId }, operation);
}
export function reportProvider(details) {
  logServerDiagnostic('provider', { ...details, requestId: context.getStore()?.requestId });
}
