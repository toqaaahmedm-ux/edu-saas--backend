import { AsyncLocalStorage } from 'async_hooks';

export const tenantContext = new AsyncLocalStorage<{ tenantId: string | null }>();

export function getCurrentTenantId(): string | null {
  return tenantContext.getStore()?.tenantId ?? null;
}