import { z } from "zod";
import { emptyState, type State } from "./domain.ts";
const id = z.uuid(),
  integer = z.number().int().safe(),
  amount = integer.nonnegative(),
  stamp = z.iso.datetime({ offset: true });
const branding = z.object({
  name: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  address: z.string().max(300).optional(),
  footer: z.string().max(240).optional(),
  width: z.union([z.literal(58), z.literal(80)]).optional(),
  logoUrl: z
    .string()
    .max(1000)
    .refine((s) => !s || s.startsWith("https://"))
    .optional(),
});
const schema = z.object({
  businessId: id,
  version: z.literal(2),
  products: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(120),
        category: z.string().max(100),
        unit: z.string().min(1).max(80),
        stock: integer,
        cost: amount,
        price: amount,
        threshold: integer.nonnegative(),
      }),
    )
    .max(10000),
  sales: z
    .array(
      z.object({
        id,
        createdAt: stamp,
        total: amount,
        paid: amount,
        method: z.string().max(80),
        customer: z.string().max(300),
        sync: z.enum(["pending", "synced", "attention"]),
        branding: branding.optional(),
        lines: z
          .array(
            z.object({
              productId: id,
              name: z.string().max(120),
              quantity: integer.positive(),
              unit: z.string().max(80),
              price: amount,
              cost: amount,
            }),
          )
          .min(1)
          .max(500),
      }),
    )
    .max(10000),
  movements: z
    .array(
      z.object({
        id,
        productId: id,
        quantity: integer,
        reason: z.string().min(1).max(500),
        createdAt: stamp,
      }),
    )
    .max(20000),
  payments: z
    .array(
      z.object({
        id,
        saleId: id,
        amount: amount.positive(),
        method: z.string().max(80),
        createdAt: stamp,
      }),
    )
    .max(20000),
});
export function parseBackup(text: string, businessId: string): State {
  if (text.length > 20_000_000)
    throw new Error("Backup exceeds the 20 MB limit.");
  const result = schema.safeParse(JSON.parse(text));
  if (!result.success)
    throw new Error("This is not a supported Shopilot business backup.");
  if (result.data.businessId !== businessId)
    throw new Error("This backup belongs to a different business.");
  const s: State = result.data,
    products = new Set(s.products.map((p) => p.id)),
    sales = new Set(s.sales.map((p) => p.id));
  for (const group of [s.products, s.sales, s.movements, s.payments])
    if (new Set(group.map((x) => x.id)).size !== group.length)
      throw new Error("Backup contains duplicate references.");
  for (const sale of s.sales) {
    if (
      sale.lines.some((l) => !products.has(l.productId)) ||
      sale.lines.reduce((sum, l) => sum + l.price * l.quantity, 0) !==
        sale.total ||
      sale.paid > sale.total ||
      (sale.paid < sale.total && !sale.customer.trim())
    )
      throw new Error("Backup contains an invalid sale.");
    if (
      sale.paid +
        s.payments
          .filter((p) => p.saleId === sale.id)
          .reduce((sum, p) => sum + p.amount, 0) >
      sale.total
    )
      throw new Error("Backup contains an overpayment.");
  }
  if (
    s.movements.some((m) => !products.has(m.productId)) ||
    s.payments.some((p) => !sales.has(p.saleId))
  )
    throw new Error("Backup contains unmatched stock or payment references.");
  return { ...emptyState, ...s };
}
export function mergeBackup(current: State, backup: State): State {
  const merge = <T extends { id: string }>(a: T[], b: T[]) => {
    const map = new Map(a.map((x) => [x.id, x]));
    for (const item of b) {
      const previous = map.get(item.id);
      if (previous) {
        const canonical = (value: unknown): unknown =>
          Array.isArray(value)
            ? value.map(canonical)
            : value !== null && typeof value === "object"
              ? Object.fromEntries(
                  Object.entries(value)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([k, v]) => [k, canonical(v)]),
                )
              : value;
        const clean = (value: T) => {
          const copy = { ...value } as Record<string, unknown>;
          delete copy.sync;
          delete copy.stock;
          delete copy.error;
          if (!("branding" in previous) || !("branding" in item))
            delete copy.branding;
          return JSON.stringify(canonical(copy));
        };
        if (clean(previous) !== clean(item))
          throw new Error(
            "Some backup references conflict with existing records. No records were changed.",
          );
      } else map.set(item.id, item);
    }
    return [...map.values()];
  };
  const products = merge(current.products, backup.products),
    movements = merge(current.movements, backup.movements),
    sales = merge(current.sales, backup.sales),
    payments = merge(current.payments, backup.payments);
  return {
    products: products.map((p) => ({
      ...p,
      stock:
        movements
          .filter((m) => m.productId === p.id)
          .reduce((sum, m) => sum + m.quantity, 0) -
        sales
          .flatMap((s) => s.lines)
          .filter((l) => l.productId === p.id)
          .reduce((sum, l) => sum + l.quantity, 0),
    })),
    movements,
    sales,
    payments,
  };
}
