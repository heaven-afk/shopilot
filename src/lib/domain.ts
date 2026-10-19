export type Product = {
  id: string;
  name: string;
  category: string;
  unit: string;
  stock: number;
  cost: number;
  price: number;
  threshold: number;
};
export type Line = {
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
  cost: number;
};
export type Sale = {
  id: string;
  createdAt: string;
  lines: Line[];
  total: number;
  paid: number;
  method: string;
  customer: string;
  sync: "pending" | "synced" | "attention";
  error?: string;
  branding?: {
    name?: string;
    phone?: string;
    address?: string;
    footer?: string;
    width?: 58 | 80;
    logoUrl?: string;
  };
};
export type Movement = {
  id: string;
  productId: string;
  quantity: number;
  reason: string;
  createdAt: string;
};
export type Payment = {
  id: string;
  saleId: string;
  amount: number;
  method: string;
  createdAt: string;
};
export type State = {
  products: Product[];
  sales: Sale[];
  movements: Movement[];
  payments: Payment[];
};
export const emptyState: State = {
  products: [],
  sales: [],
  movements: [],
  payments: [],
};
export const paidFor = (state: State, sale: Sale) =>
  sale.paid +
  state.payments
    .filter((p) => p.saleId === sale.id)
    .reduce((sum, p) => sum + p.amount, 0);
export function recordPayment(state: State, payment: Payment): State {
  if (state.payments.some((p) => p.id === payment.id)) return state;
  const sale = state.sales.find((s) => s.id === payment.saleId);
  if (!sale) throw new Error("Sale was not found.");
  if (
    !Number.isSafeInteger(payment.amount) ||
    payment.amount <= 0 ||
    payment.amount > sale.total - paidFor(state, sale)
  )
    throw new Error(
      "Payment must be positive and cannot exceed the outstanding balance.",
    );
  return { ...state, payments: [payment, ...state.payments] };
}
export const money = (kobo: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(kobo / 100);
export function toKobo(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Enter a valid amount with at most two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw new Error("Amount is too large.");
  return result;
}
export function recordSale(state: State, sale: Sale): State {
  if (state.sales.some((s) => s.id === sale.id)) return state;
  if (!sale.lines.length) throw new Error("Add at least one product.");
  const totals = new Map<string, number>();
  for (const line of sale.lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0)
      throw new Error("Quantities must be positive whole numbers.");
    const product = state.products.find((p) => p.id === line.productId);
    if (!product || line.price !== product.price || line.cost !== product.cost)
      throw new Error("Product pricing changed. Please rebuild this sale.");
    totals.set(
      line.productId,
      (totals.get(line.productId) || 0) + line.quantity,
    );
  }
  for (const [id, qty] of totals) {
    if ((state.products.find((p) => p.id === id)?.stock ?? 0) < qty)
      throw new Error("Insufficient stock on this device.");
  }
  if (
    sale.total !==
      sale.lines.reduce((sum, line) => sum + line.price * line.quantity, 0) ||
    !Number.isSafeInteger(sale.total) ||
    !Number.isSafeInteger(sale.paid) ||
    sale.paid < 0 ||
    sale.paid > sale.total
  )
    throw new Error("Invalid sale amount.");
  if (sale.paid < sale.total && !sale.customer.trim())
    throw new Error("Identify the customer for a credit sale.");
  return {
    ...state,
    products: state.products.map((p) => ({
      ...p,
      stock: p.stock - (totals.get(p.id) || 0),
    })),
    sales: [sale, ...state.sales],
  };
}
