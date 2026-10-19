import type { State } from "./domain.ts";
import { mergeBackup } from "./backup.ts";
// Keep operations created while an upload was in flight. Only the sent snapshot
// is acknowledged, never the later local work.
export function reconcileUpload(
  remote: State,
  current: State,
  sent: State,
): State {
  const newer = <T extends { id: string }>(latest: T[], uploaded: T[]) => {
    const ids = new Set(uploaded.map((x) => x.id));
    return latest.filter((x) => !ids.has(x.id));
  };
  return mergeBackup(remote, {
    products: newer(current.products, sent.products),
    sales: newer(current.sales, sent.sales),
    movements: newer(current.movements, sent.movements),
    payments: newer(current.payments, sent.payments),
  });
}
