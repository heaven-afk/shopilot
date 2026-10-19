"use client";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  Check,
  ChevronRight,
  Package,
  Plus,
  ShoppingBag,
  TrendingUp,
  Wifi,
  WifiOff,
} from "lucide-react";
import { money, paidFor, type State, type Sale } from "../lib/domain";
type Props = {
  state: State;
  ownerName: string;
  online: boolean;
  syncing: boolean;
  onNavigate: (page: string) => void;
  onScan: () => void;
  onReceive: () => void;
  onProduct: () => void;
  onReceipt: (sale: Sale) => void;
};
const businessDay = (value: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
    new Date(value),
  );
export default function MobileDashboard({
  state,
  ownerName,
  online,
  syncing,
  onNavigate,
  onScan,
  onReceive,
  onProduct,
  onReceipt,
}: Props) {
  const now = new Date(),
    today = businessDay(now.toISOString()),
    sales = state.sales.filter((s) => businessDay(s.createdAt) === today);
  const revenue = sales.reduce((sum, s) => sum + s.total, 0),
    collected =
      sales.reduce((sum, s) => sum + s.paid, 0) +
      state.payments
        .filter((p) => businessDay(p.createdAt) === today)
        .reduce((sum, p) => sum + p.amount, 0),
    debt = state.sales.reduce((sum, s) => sum + s.total - paidFor(state, s), 0);
  const low = state.products.filter((p) => p.stock <= p.threshold),
    profit = sales.reduce(
      (sum, s) =>
        sum + s.lines.reduce((a, l) => a + (l.price - l.cost) * l.quantity, 0),
      0,
    );
  const days = Array.from({ length: 7 }, (_, index) => {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - 6 + index);
      return {
        label: d.toLocaleDateString("en-NG", {
          timeZone: "Africa/Lagos",
          weekday: "short",
        }),
        value: state.sales
          .filter(
            (s) => businessDay(s.createdAt) === businessDay(d.toISOString()),
          )
          .reduce((sum, s) => sum + s.total, 0),
      };
    }),
    max = Math.max(1, ...days.map((d) => d.value));
  return (
    <div className="mobile-dashboard">
      <div className="mobile-greeting">
        <div>
          <p>
            {now.toLocaleDateString("en-NG", {
              timeZone: "Africa/Lagos",
              weekday: "long",
              day: "numeric",
              month: "short",
            })}
          </p>
          <h1>Hello, {ownerName.trim().split(/\s+/)[0]}.</h1>
        </div>
        <span className={`mobile-network ${!online ? "disconnected" : ""}`}>
          {online ? <Wifi size={13} /> : <WifiOff size={13} />}{" "}
          {syncing ? "Syncing" : online ? "Online" : "Offline"}
        </span>
      </div>
      <section className="mobile-sales-summary" aria-label="Today’s sales">
        <div className="mobile-summary-label">
          <span>SALES TODAY</span>
          <ShoppingBag size={19} />
        </div>
        <strong className="mobile-hero-amount">{money(revenue)}</strong>
        <div className="mobile-summary-details">
          <span>
            {sales.length} {sales.length === 1 ? "sale" : "sales"} recorded
          </span>
          <span>
            Gross profit <b>{money(profit)}</b>
          </span>
        </div>
        <button onClick={() => onNavigate("Record sale")}>
          <Plus size={20} /> Record a sale <ArrowUpRight size={19} />
        </button>
      </section>
      <div className="mobile-money-row">
        <section>
          <span>
            <ArrowDownLeft size={15} /> Collected today
          </span>
          <strong>{money(collected)}</strong>
          <small>Includes debt repayments</small>
        </section>
        <button onClick={() => onNavigate("Customers & credit")}>
          <span>
            Customer credit <ChevronRight size={14} />
          </span>
          <strong>{money(debt)}</strong>
          <small>Outstanding balance</small>
        </button>
      </div>
      <section className="mobile-quick-actions" aria-label="Quick actions">
        <button onClick={onScan}>
          <span>
            <Camera size={23} />
          </span>
          Scan stock
        </button>
        <button onClick={onReceive}>
          <span>
            <ArrowDownLeft size={23} />
          </span>
          Receive stock
        </button>
        <button onClick={onProduct}>
          <span>
            <Package size={23} />
          </span>
          Add product
        </button>
      </section>
      <button
        className={`mobile-stock-notice ${low.length ? "needs-attention" : ""}`}
        onClick={() => onNavigate("Inventory")}
      >
        <span className="mobile-notice-icon">
          {low.length ? <Package size={21} /> : <Check size={21} />}
        </span>
        <span>
          <strong>
            {low.length
              ? `${low.length} ${low.length === 1 ? "product needs" : "products need"} restocking`
              : state.products.length
                ? "Stock levels look good"
                : "Let’s set up your stock"}
          </strong>
          <small>
            {low.length
              ? low
                  .slice(0, 2)
                  .map((p) => `${p.name}: ${p.stock} ${p.unit}`)
                  .join(" · ")
              : state.products.length
                ? "All products are above their alert levels."
                : "Add your first product and opening quantity."}
          </small>
        </span>
        <ChevronRight size={18} />
      </button>
      <section className="mobile-trend">
        <div className="mobile-section-heading">
          <div>
            <h2>Your week in sales</h2>
            <p>Last 7 days</p>
          </div>
          <button
            onClick={() => onNavigate("Business insights")}
            aria-label="View business insights"
          >
            <TrendingUp size={19} />
          </button>
        </div>
        {state.sales.length ? (
          <div
            className="mobile-bars"
            role="img"
            aria-label={days
              .map((d) => `${d.label}: ${money(d.value)}`)
              .join(", ")}
          >
            {days.map((d, i) => (
              <div key={i}>
                <div className="mobile-bar-track">
                  <span
                    className={i === 6 ? "today" : ""}
                    style={{ height: `${Math.max(3, (d.value / max) * 100)}%` }}
                  />
                </div>
                <small>{d.label}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="mobile-trend-empty">
            <TrendingUp size={28} />
            <p>Your sales trend starts with your first sale.</p>
          </div>
        )}
        <button
          className="mobile-insights-link"
          onClick={() => onNavigate("Business insights")}
        >
          See business insights <ArrowUpRight size={16} />
        </button>
      </section>
      <section className="mobile-activity">
        <div className="mobile-section-heading">
          <h2>Recent sales</h2>
          <button onClick={() => onNavigate("Sales history")}>
            See all <ChevronRight size={15} />
          </button>
        </div>
        {state.sales.length ? (
          state.sales.slice(0, 4).map((s) => (
            <button
              className="mobile-sale-row"
              key={s.id}
              onClick={() => onReceipt(s)}
            >
              <span className="mobile-sale-icon">
                <ShoppingBag size={18} />
              </span>
              <span className="mobile-sale-info">
                <strong>{s.customer || "Walk-in customer"}</strong>
                <small>
                  {new Date(s.createdAt).toLocaleTimeString("en-NG", {
                    timeZone: "Africa/Lagos",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {s.lines.length} {s.lines.length === 1 ? "item" : "items"} ·{" "}
                  {s.sync === "synced" ? "Synced" : "Pending sync"}
                </small>
              </span>
              <span className="mobile-sale-value">
                <strong>{money(s.total)}</strong>
                <small
                  className={paidFor(state, s) === s.total ? "paid" : "due"}
                >
                  {paidFor(state, s) === s.total
                    ? "Paid"
                    : `${money(s.total - paidFor(state, s))} due`}
                </small>
              </span>
            </button>
          ))
        ) : (
          <div className="mobile-activity-empty">
            <ShoppingBag size={24} />
            <strong>No sales recorded yet</strong>
            <p>Your latest sales and receipts will appear here.</p>
          </div>
        )}
      </section>
      <button
        className="mobile-inventory-total"
        onClick={() => onNavigate("Inventory")}
      >
        <span>
          <Package size={19} />
          <span>
            Inventory at cost<small>{state.products.length} products</small>
          </span>
        </span>
        <strong>
          {money(state.products.reduce((sum, p) => sum + p.stock * p.cost, 0))}
          <ChevronRight size={16} />
        </strong>
      </button>
    </div>
  );
}
