"use client";
import { ChevronRight, Package, ShoppingBag } from "lucide-react";
import {
  money,
  paidFor,
  type Product,
  type Sale,
  type State,
} from "../lib/domain";
export function MobileSales({
  sales,
  state,
  onReceipt,
}: {
  sales: Sale[];
  state: State;
  onReceipt: (sale: Sale) => void;
}) {
  return (
    <div className="mobile-records-list">
      {sales.length ? (
        sales.map((s) => (
          <button
            className="mobile-history-card"
            key={s.id}
            onClick={() => onReceipt(s)}
          >
            <div>
              <span className="mobile-sale-icon">
                <ShoppingBag size={19} />
              </span>
              <span>
                <strong>{s.customer || "Walk-in customer"}</strong>
                <small>SP-{s.id.slice(0, 8).toUpperCase()}</small>
              </span>
              <ChevronRight size={18} />
            </div>
            <div className="mobile-history-amount">
              <strong>{money(s.total)}</strong>
              <span
                className={`badge ${paidFor(state, s) === s.total ? "green" : "amber"}`}
              >
                {paidFor(state, s) === s.total
                  ? "Paid"
                  : `${money(s.total - paidFor(state, s))} due`}
              </span>
            </div>
            <p>
              {new Date(s.createdAt).toLocaleString("en-NG", {
                timeZone: "Africa/Lagos",
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              · {s.method}
            </p>
            <small>
              {s.sync === "synced" ? "Synced" : "Pending sync"} ·{" "}
              {s.lines.length} {s.lines.length === 1 ? "item" : "items"}
            </small>
          </button>
        ))
      ) : (
        <div className="empty">
          No sales to show.
          <small>Your recorded transactions will appear here.</small>
        </div>
      )}
    </div>
  );
}
export function MobileProducts({
  products,
  onAdd,
}: {
  products: Product[];
  onAdd: () => void;
}) {
  return (
    <div className="mobile-records-list">
      {products.length ? (
        products.map((p) => (
          <article className="mobile-product-card" key={p.id}>
            <div>
              <span className="mobile-sale-icon">
                <Package size={20} />
              </span>
              <span>
                <strong>{p.name}</strong>
                <small>
                  {p.category} · {p.unit}
                </small>
              </span>
            </div>
            <div className="mobile-product-stock">
              <strong>
                {p.stock} <span>{p.unit}</span>
              </strong>
              <span
                className={`badge ${p.stock <= p.threshold ? "amber" : "green"}`}
              >
                {p.stock <= p.threshold ? "Low stock" : "In stock"}
              </span>
            </div>
            <div className="mobile-product-prices">
              <span>
                Cost <strong>{money(p.cost)}</strong>
              </span>
              <span>
                Selling price <strong>{money(p.price)}</strong>
              </span>
            </div>
          </article>
        ))
      ) : (
        <div className="empty">
          Your inventory starts here.
          <small>Add products and their opening quantities.</small>
          <button className="button primary" onClick={onAdd}>
            Add your first product
          </button>
        </div>
      )}
    </div>
  );
}
