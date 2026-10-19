"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Box,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  LayoutDashboard,
  LogOut,
  Package,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  emptyState,
  money,
  paidFor,
  recordPayment,
  recordSale,
  toKobo,
  type Product,
  type Sale,
  type State,
} from "../lib/domain";
import {
  readState,
  writeState,
  readPhoto,
  writePhoto,
  setStorageScope,
} from "../lib/storage";
import { getSupabase } from "../lib/supabase";
import CloudSettings, { type Workspace } from "./cloud-settings";
import AccessGate from "./access-gate";

type ScanRow = {
  name: string;
  quantity: number;
  unit: string;
  productId: string;
};
const navigation = [
  ["Overview", LayoutDashboard],
  ["Record sale", ShoppingCart],
  ["Inventory", Package],
  ["Sales history", BarChart3],
  ["Customers & credit", Users],
  ["Business insights", Sparkles],
] as const;
const date = (value: string) =>
  new Date(value).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
    timeStyle: "short",
  });
const today = (value: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
    new Date(value),
  );
function download(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Page() {
  return (
    <AccessGate>
      {(access, onExit) => (
        <Home
          key={access.workspace.id}
          initialWorkspace={access.workspace}
          ownerName={access.ownerName}
          onExit={onExit}
        />
      )}
    </AccessGate>
  );
}
function Home({
  initialWorkspace,
  ownerName,
  onExit,
}: {
  initialWorkspace: Workspace;
  ownerName: string;
  onExit: () => Promise<void>;
}) {
  const [state, setState] = useState<State>(emptyState),
    [ready, setReady] = useState(false),
    [online, setOnline] = useState(true),
    [offlineReady, setOfflineReady] = useState(false),
    [page, setPage] = useState("Overview"),
    [modal, setModal] = useState<
      "product" | "receive" | "scan" | "payment" | null
    >(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [receipt, setReceipt] = useState<Sale | null>(null),
    [busy, setBusy] = useState(false);
  const current = useRef(state),
    lock = useRef(false),
    channel = useRef<BroadcastChannel | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({}),
    [customer, setCustomer] = useState(""),
    [paid, setPaid] = useState(""),
    [method, setMethod] = useState("Cash");
  const [image, setImage] = useState<string | null>(null),
    [scan, setScan] = useState<ScanRow[]>([]),
    [scanning, setScanning] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(
      initialWorkspace,
    ),
    [syncing, setSyncing] = useState(false);
  const workspaceRef = useRef<Workspace | null>(initialWorkspace);
  useEffect(() => {
    if (!modal && !receipt) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select, a[href], [tabindex="0"]',
        ) || [],
      );
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal(null);
        setReceipt(null);
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      if (event.shiftKey && document.activeElement === elements[0]) {
        event.preventDefault();
        elements.at(-1)?.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === elements.at(-1)
      ) {
        event.preventDefault();
        elements[0].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [modal, receipt]);
  useEffect(() => {
    if (!ready) return;
    readPhoto()
      .then(setImage)
      .catch(() => {});
    setScan([]);
  }, [ready, workspace]);
  async function switchWorkspace(value: Workspace | null) {
    if (!value) {
      await onExit();
      return;
    }
    if (lock.current) throw new Error("Wait for the current save to finish.");
    await navigator.locks.request("shopilot-write", async () => {
      setStorageScope(value?.id || null);
      const next = await readState();
      current.current = next;
      setState(next);
      workspaceRef.current = value;
      setWorkspace(value);
      setCart({});
      setReceipt(null);
      const session = await getSupabase()?.auth.getSession();
      if (value && session?.data.session)
        localStorage.setItem(
          "shopilot-workspace",
          JSON.stringify({
            userId: session.data.session.user.id,
            workspace: value,
          }),
        );
      else localStorage.removeItem("shopilot-workspace");
    });
  }
  async function syncCloud() {
    const client = getSupabase(),
      ws = workspaceRef.current;
    if (!client || !ws || !navigator.onLine || lock.current) return;
    lock.current = true;
    setSyncing(true);
    try {
      await navigator.locks.request("shopilot-write", async () => {
        const latest = await readState();
        const { data, error } = await client
          .rpc("sync_workspace", {
            bid: ws.id,
            payload: latest,
          })
          .abortSignal(AbortSignal.timeout(20000));
        if (error) throw error;
        await writeState(data as State);
        current.current = data as State;
        setState(data as State);
        channel.current?.postMessage("changed");
        const conflicts = (data as State).products.filter((p) => p.stock < 0);
        setNotice(
          conflicts.length
            ? `Synced. ${conflicts.length} stock balance(s) need reconciliation after offline sales. Review physical stock and record adjustments.`
            : "Business records synchronised with Supabase.",
        );
      });
    } catch (e) {
      setError(
        `Sync did not complete: ${(e as Error).message}. Local records are retained.`,
      );
      throw e;
    } finally {
      lock.current = false;
      setSyncing(false);
    }
  }
  useEffect(() => {
    if (!workspace || !ready) return;
    const run = () => {
      syncCloud().catch(() => {});
    };
    run();
    const timer = setInterval(run, 60000);
    window.addEventListener("online", run);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", run);
    };
  }, [workspace, ready]);
  useEffect(() => {
    readState()
      .then((value) => {
        current.current = value;
        setState(value);
        setReady(true);
      })
      .catch(() =>
        setError(
          "Device storage is unavailable. Sales are disabled until storage is available.",
        ),
      );
    setOnline(navigator.onLine);
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    channel.current = new BroadcastChannel("shopilot");
    channel.current.onmessage = () =>
      readState().then((value) => {
        current.current = value;
        setState(value);
      });
    const workerMessage = (event: MessageEvent) => {
      if (event.data?.type === "OFFLINE_READY") setOfflineReady(true);
      if (event.data?.type === "OFFLINE_FAILED")
        setNotice(
          "Offline preparation failed. Keep this page open and reconnect before relying on offline reload.",
        );
    };
    navigator.serviceWorker?.addEventListener("message", workerMessage);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => reg.active?.postMessage("CACHE_SHELL"))
        .catch(() => setNotice("Offline page caching could not be prepared."));
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      navigator.serviceWorker?.removeEventListener("message", workerMessage);
      channel.current?.close();
    };
  }, []);
  async function mutate(change: (previous: State) => State) {
    if (lock.current)
      throw new Error("Another save or sync is in progress. Try again.");
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await navigator.locks.request("shopilot-write", async () => {
        const latest = await readState();
        const next = change(latest);
        await writeState(next);
        current.current = next;
        setState(next);
        channel.current?.postMessage("changed");
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save. Your previous records remain unchanged.",
      );
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const salesToday = state.sales.filter(
      (s) => today(s.createdAt) === today(new Date().toISOString()),
    ),
    revenue = salesToday.reduce((s, x) => s + x.total, 0),
    collected =
      salesToday.reduce((s, x) => s + x.paid, 0) +
      state.payments
        .filter((p) => today(p.createdAt) === today(new Date().toISOString()))
        .reduce((sum, p) => sum + p.amount, 0),
    debt = state.sales.reduce((s, x) => s + x.total - paidFor(state, x), 0),
    low = state.products.filter((p) => p.stock <= p.threshold),
    total = Object.entries(cart).reduce(
      (sum, [id, qty]) =>
        sum + (state.products.find((p) => p.id === id)?.price ?? 0) * qty,
      0,
    );
  const filtered = state.products.filter((p) =>
    `${p.name} ${p.category}`.toLowerCase().includes(search.toLowerCase()),
  );
  const movementHistory = [
    ...state.movements,
    ...state.sales.flatMap((s) =>
      s.lines.map((line, index) => ({
        id: `${s.id}:${index}`,
        productId: line.productId,
        quantity: -line.quantity,
        reason: `Sale SP-${s.id.slice(0, 8).toUpperCase()}`,
        createdAt: s.createdAt,
      })),
    ),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  async function addProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const stock = Number(form.get("stock")),
        threshold = Number(form.get("threshold"));
      if (
        !Number.isSafeInteger(stock) ||
        stock < 0 ||
        !Number.isSafeInteger(threshold) ||
        threshold < 0
      )
        throw new Error(
          "Stock and threshold must be nonnegative whole numbers.",
        );
      const product: Product = {
        id: crypto.randomUUID(),
        name: String(form.get("name")).trim(),
        category: String(form.get("category")).trim() || "General",
        unit: String(form.get("unit")).trim(),
        stock,
        cost: toKobo(String(form.get("cost"))),
        price: toKobo(String(form.get("price"))),
        threshold,
      };
      if (!product.name || !product.unit)
        throw new Error("Enter a product name and stock unit.");
      await mutate((s) => ({
        ...s,
        products: [...s.products, product],
        movements: [
          {
            id: crypto.randomUUID(),
            productId: product.id,
            quantity: stock,
            reason: "Opening stock",
            createdAt: new Date().toISOString(),
          },
          ...s.movements,
        ],
      }));
      setModal(null);
      setNotice("Product saved on this device.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function receive(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const id = String(form.get("product")),
        qty = Number(form.get("quantity")),
        reason = String(form.get("reason"));
      if (!Number.isSafeInteger(qty) || qty === 0)
        throw new Error("Enter a nonzero whole quantity.");
      await mutate((s) => {
        const product = s.products.find((p) => p.id === id);
        if (!product) throw new Error("Choose a product.");
        if (product.stock + qty < 0)
          throw new Error("Adjustment would create negative stock.");
        return {
          ...s,
          products: s.products.map((p) =>
            p.id === id ? { ...p, stock: p.stock + qty } : p,
          ),
          movements: [
            {
              id: crypto.randomUUID(),
              productId: id,
              quantity: qty,
              reason,
              createdAt: new Date().toISOString(),
            },
            ...s.movements,
          ],
        };
      });
      setModal(null);
      setNotice("Inventory updated.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function confirmSale() {
    try {
      const sale: Sale = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        lines: Object.entries(cart)
          .filter(([, qty]) => qty > 0)
          .map(([id, quantity]) => {
            const p = state.products.find((p) => p.id === id)!;
            return {
              productId: id,
              name: p.name,
              quantity,
              unit: p.unit,
              price: p.price,
              cost: p.cost,
            };
          }),
        total,
        paid: paid === "" ? total : toKobo(paid),
        method,
        customer,
        sync: "pending",
      };
      await mutate((s) => recordSale(s, sale));
      setCart({});
      setCustomer("");
      setPaid("");
      setReceipt(sale);
      setNotice(
        workspace
          ? "Sale saved on this device. It will sync when connected."
          : "Sale saved locally. Connect a cloud workspace in Settings to enable sync.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function scanPhoto(file: File) {
    setError("");
    if (file.size > 3 * 1024 * 1024) {
      setError("Choose a photo smaller than 3 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      writePhoto(String(reader.result))
        .then(() => {
          setImage(String(reader.result));
          setScan([]);
        })
        .catch(() =>
          setError(
            "Could not save the photo draft. Check available device storage.",
          ),
        );
    };
    reader.readAsDataURL(file);
  }
  async function analyse() {
    if (!image) return;
    setScanning(true);
    setError("");
    try {
      const session = await getSupabase()?.auth.getSession();
      const response = await fetch("/api/recognize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.data.session
            ? { Authorization: "Bearer " + session.data.session.access_token }
            : {}),
        },
        body: JSON.stringify({ image }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Recognition failed.");
      setScan(
        data.items.map(
          (row: { name: string; quantity: number; unit: string }) => ({
            ...row,
            productId: "",
          }),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }
  async function confirmScan() {
    try {
      if (
        !scan.length ||
        scan.some(
          (row) =>
            !row.productId ||
            !Number.isSafeInteger(row.quantity) ||
            row.quantity <= 0,
        )
      )
        throw new Error(
          "Match every row to a product and confirm positive whole quantities.",
        );
      await mutate((s) => ({
        ...s,
        products: s.products.map((p) => ({
          ...p,
          stock:
            p.stock +
            scan
              .filter((r) => r.productId === p.id)
              .reduce((sum, r) => sum + r.quantity, 0),
        })),
        movements: [
          ...scan.map((r) => ({
            id: crypto.randomUUID(),
            productId: r.productId,
            quantity: r.quantity,
            reason: "Photo receiving — reviewed by owner",
            createdAt: new Date().toISOString(),
          })),
          ...s.movements,
        ],
      }));
      setModal(null);
      setScan([]);
      setImage(null);
      await writePhoto(null);
      setNotice("Reviewed stock received.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function exportCSV() {
    const cell = (value: unknown) =>
      '"' +
      String(value)
        .replace(/"/g, '""')
        .replace(/^[=+@-]/, "'$&") +
      '"';
    download(
      "shopilot-sales.csv",
      [
        [
          "Reference",
          "Date",
          "Customer",
          "Total NGN",
          "Paid NGN",
          "Balance NGN",
          "Payment method",
        ],
        ...state.sales.map((s) => [
          s.id,
          s.createdAt,
          s.customer,
          s.total / 100,
          paidFor(state, s) / 100,
          (s.total - paidFor(state, s)) / 100,
          s.method,
        ]),
      ]
        .map((row) => row.map(cell).join(","))
        .join("\r\n"),
      "text/csv",
    );
  }
  async function repay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const payment = {
        id: crypto.randomUUID(),
        saleId: String(form.get("sale")),
        amount: toKobo(String(form.get("amount"))),
        method: String(form.get("method")),
        createdAt: new Date().toISOString(),
      };
      await mutate((s) => recordPayment(s, payment));
      setModal(null);
      setNotice("Repayment saved separately. Sales revenue is unchanged.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const saleTable = (sales: Sale[]) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Transaction / customer</th>
            <th>Date</th>
            <th>Amount</th>
            <th>Payment</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sales.length ? (
            sales.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>SP-{s.id.slice(0, 8).toUpperCase()}</strong>
                  <small>
                    {s.customer || "Walk-in customer"} · {s.lines.length} item
                    {s.lines.length === 1 ? "" : "s"}
                  </small>
                </td>
                <td>{date(s.createdAt)}</td>
                <td>
                  <strong>{money(s.total)}</strong>
                </td>
                <td>{s.method}</td>
                <td>
                  <span
                    className={
                      "badge " +
                      (paidFor(state, s) === s.total ? "green" : "amber")
                    }
                  >
                    {paidFor(state, s) === s.total
                      ? "Paid"
                      : paidFor(state, s)
                        ? "Part paid"
                        : "Unpaid"}
                  </span>
                  <small>
                    {s.sync === "synced" ? "Synced" : "Pending sync"}
                  </small>
                </td>
                <td>
                  <button
                    className="icon-btn"
                    aria-label="View receipt"
                    onClick={() => setReceipt(s)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6}>
                <div className="empty">
                  Your first sale starts the story.
                  <small>Record a sale to see transactions here.</small>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-icon">
            <ShoppingBag size={23} />
          </span>
          shopilot<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="store-avatar">
            {initialWorkspace.name
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((word) => word[0])
              .join("")
              .toUpperCase()}
          </span>
          <div>
            <strong>{workspace?.name || "Your shop"}</strong>
            <small>{workspace ? "Cloud workspace" : "Local workspace"}</small>
          </div>
          <span className="workspace-arrow">⌄</span>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {navigation.map(([label, Icon]) => (
            <button
              key={label}
              className={page === label ? "active" : ""}
              onClick={() => {
                setPage(label);
                setSearch("");
                setError("");
              }}
            >
              <Icon size={19} />
              {label}
              {label === "Business insights" && (
                <span className="new-label">NEW</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="tip">
            <span className="tip-icon">
              <Sparkles size={18} />
            </span>
            <strong>A little clarity. More growth.</strong>
            <p>Your next business decision starts with better records.</p>
            <button onClick={() => setPage("Business insights")}>
              Explore insights <ArrowUpRight size={15} />
            </button>
          </div>
          <button className="bottom-nav" onClick={() => setPage("Settings")}>
            <Settings size={18} /> Settings & data
          </button>
          <button className="bottom-nav" onClick={() => setPage("Help")}>
            <CircleHelp size={18} /> Help & documentation
          </button>
          <button
            className="bottom-nav"
            disabled={busy || syncing}
            onClick={() => onExit().catch((e) => setError(e.message))}
          >
            <LogOut size={18} /> Sign out
          </button>
          <div className="profile">
            <span className="profile-avatar">
              {ownerName.trim().slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{ownerName}</strong>
              <small>Business owner</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className={"connection " + (!online ? "offline" : "")}>
              {online ? <Wifi size={14} /> : <WifiOff size={14} />}{" "}
              {online ? "Online" : "Offline"}
            </span>
            <button className="local-pill" onClick={() => setPage("Settings")}>
              {syncing
                ? "Syncing…"
                : workspace
                  ? "Cloud workspace"
                  : "Device only"}
            </button>
            <span className="header-avatar">
              {ownerName.trim().slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR BUSINESS, IN VIEW</div>
              <h1>
                {page === "Overview" ? "A clearer picture of your shop." : page}
              </h1>
              <p>
                {page === "Overview"
                  ? "Keep track of today. Make room for what’s next."
                  : page === "Inventory"
                    ? "Every product. Every movement. All accounted for."
                    : page === "Record sale"
                      ? "Record the goods sold and how your customer paid."
                      : page === "Business insights"
                        ? "Practical next steps, grounded in your records."
                        : "Your business records, organised."}
              </p>
            </div>
            <div className="heading-actions">
              {page === "Overview" ? (
                <>
                  <button
                    className="button secondary"
                    onClick={() => setModal("scan")}
                  >
                    <Camera size={17} /> Scan stock
                  </button>
                  <button
                    className="button primary"
                    onClick={() => setPage("Record sale")}
                  >
                    <Plus size={18} /> Record sale
                  </button>
                </>
              ) : page === "Inventory" ? (
                <>
                  <button
                    className="button secondary"
                    onClick={() => setModal("receive")}
                  >
                    <ArrowDownLeft size={17} /> Receive stock
                  </button>
                  <button
                    className="button primary"
                    onClick={() => setModal("product")}
                  >
                    <Plus size={17} /> Add product
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {!ready && <div className="banner">Preparing device storage…</div>}
          {error && (
            <div className="banner error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="banner" role="status">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "Overview" && (
            <>
              <div className="period-row">
                <span>
                  <span className="live-dot" /> Today’s overview
                </span>
                <span>
                  {new Date().toLocaleDateString("en-NG", {
                    timeZone: "Africa/Lagos",
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="stats">
                {[
                  {
                    label: "Sales today",
                    value: money(revenue),
                    note: `${salesToday.length} recorded transactions`,
                    icon: ShoppingCart,
                  },
                  {
                    label: "Money collected today",
                    value: money(collected),
                    note: "Includes customer debt repayments",
                    icon: ArrowDownLeft,
                  },
                  {
                    label: "Inventory value",
                    value: money(
                      state.products.reduce((s, p) => s + p.stock * p.cost, 0),
                    ),
                    note: `${state.products.length} products in your catalogue`,
                    icon: Package,
                  },
                  {
                    label: "Outstanding credit",
                    value: money(debt),
                    note: `${state.sales.filter((s) => paidFor(state, s) < s.total).length} sales awaiting payment`,
                    icon: Users,
                  },
                ].map(({ label, value, note, icon: Icon }) => (
                  <section className="stat" key={label}>
                    <div className="stat-label">
                      {label}
                      <span>
                        <Icon size={17} />
                      </span>
                    </div>
                    <div className="stat-value">{value}</div>
                    <small>{note}</small>
                  </section>
                ))}
              </div>
              <div className="overview-grid">
                <section className="panel sales-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Sales at a glance</h2>
                      <p>Your last 7 days of recorded sales</p>
                    </div>
                    <span className="subtle-label">Sales value · ₦</span>
                  </div>
                  {state.sales.length ? (
                    <div className="chart">
                      {Array.from({ length: 7 }, (_, i) => {
                        const d = new Date();
                        d.setDate(d.getDate() - 6 + i);
                        const key = today(d.toISOString()),
                          value = state.sales
                            .filter((s) => today(s.createdAt) === key)
                            .reduce((sum, s) => sum + s.total, 0),
                          max = Math.max(
                            1,
                            ...Array.from({ length: 7 }, (_, j) => {
                              const x = new Date();
                              x.setDate(x.getDate() - 6 + j);
                              return state.sales
                                .filter(
                                  (s) =>
                                    today(s.createdAt) ===
                                    today(x.toISOString()),
                                )
                                .reduce((sum, s) => sum + s.total, 0);
                            }),
                          );
                        return (
                          <div className="chart-column" key={i}>
                            <span>{value ? money(value) : ""}</span>
                            <div className="chart-track">
                              <div
                                style={{
                                  height: `${Math.max((value / max) * 100, 1)}%`,
                                }}
                              />
                            </div>
                            <small>
                              {d.toLocaleDateString("en-NG", {
                                weekday: "short",
                              })}
                            </small>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="chart-empty">
                      <div className="chart-grid" />
                      <span className="empty-icon">
                        <TrendingUp size={29} />
                      </span>
                      <h3>Good records lead to good decisions.</h3>
                      <p>Your sales trend will appear after your first sale.</p>
                      <button
                        className="text-button"
                        onClick={() => setPage("Record sale")}
                      >
                        Record your first sale <ArrowUpRight size={15} />
                      </button>
                    </div>
                  )}
                  <div className="panel-footer">
                    <span>Gross profit today</span>
                    <strong>
                      {money(
                        salesToday.reduce(
                          (sum, s) =>
                            sum +
                            s.lines.reduce(
                              (a, l) => a + (l.price - l.cost) * l.quantity,
                              0,
                            ),
                          0,
                        ),
                      )}
                    </strong>
                    <small>Before business expenses</small>
                  </div>
                </section>
                <section className="insight-card">
                  <span className="insight-kicker">
                    <Sparkles size={16} /> SHOPILOT INSIGHTS
                  </span>
                  <h2>
                    A small step.
                    <br />A smarter business.
                  </h2>
                  <p>
                    {state.products.length
                      ? low.length
                        ? `${low.length} product${low.length === 1 ? " is" : "s are"} at or below the low-stock threshold. Check what needs replenishing.`
                        : "Your stock is above its alert levels. Keep recording sales to uncover more useful patterns."
                      : "Add your products and opening stock. We’ll help you spot what sells, what’s running low, and where to grow."}
                  </p>
                  <button
                    onClick={() =>
                      state.products.length
                        ? setPage("Business insights")
                        : setModal("product")
                    }
                  >
                    {state.products.length
                      ? "View business insights"
                      : "Add your first product"}
                    <ArrowUpRight size={18} />
                  </button>
                  <div className="insight-art">
                    <div />
                    <div />
                    <div />
                    <TrendingUp size={58} />
                  </div>
                  <span className="insight-foot">
                    Built on your data. Reviewed by you.
                  </span>
                </section>
              </div>
              <div className="overview-bottom">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Recent transactions</h2>
                      <p>A quick look at your latest sales</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setPage("Sales history")}
                    >
                      View all <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {saleTable(state.sales.slice(0, 4))}
                </section>
                <section className="panel stock-alerts">
                  <div className="panel-heading">
                    <div>
                      <h2>Stock watch</h2>
                      <p>A little attention goes a long way</p>
                    </div>
                    <span className="badge amber">{low.length} low</span>
                  </div>
                  {low.length ? (
                    low.slice(0, 4).map((p) => (
                      <div className="stock-watch-row" key={p.id}>
                        <span className="product-icon">
                          <Box size={19} />
                        </span>
                        <div>
                          <strong>{p.name}</strong>
                          <small>
                            {p.stock} {p.unit} left · alert at {p.threshold}
                          </small>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="stock-clear">
                      <Check size={23} />
                      <strong>
                        {state.products.length
                          ? "Stock levels look good"
                          : "A fresh start for your stock"}
                      </strong>
                      <p>
                        {state.products.length
                          ? "No products below their alert threshold."
                          : "Add products to keep an eye on your inventory."}
                      </p>
                    </div>
                  )}
                  <button
                    className="stock-link"
                    onClick={() => setPage("Inventory")}
                  >
                    Open inventory <ChevronRight size={16} />
                  </button>
                </section>
              </div>
            </>
          )}
          {page === "Inventory" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    Product catalogue{" "}
                    <span className="count">{state.products.length}</span>
                  </h2>
                  <p>Stock is shown in each product’s configured unit.</p>
                </div>
                <div className="search">
                  <Search size={17} />
                  <input
                    aria-label="Search products"
                    placeholder="Search products…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>In stock</th>
                      <th>Cost / unit</th>
                      <th>Selling price</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <small>{p.unit}</small>
                        </td>
                        <td>{p.category}</td>
                        <td>
                          {p.stock} {p.unit}
                        </td>
                        <td>{money(p.cost)}</td>
                        <td>{money(p.price)}</td>
                        <td>
                          <span
                            className={
                              "badge " +
                              (p.stock <= p.threshold ? "amber" : "green")
                            }
                          >
                            {p.stock <= p.threshold ? "Low stock" : "In stock"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!filtered.length && (
                      <tr>
                        <td colSpan={6}>
                          <div className="empty">
                            No products yet.
                            <small>
                              Add your first product to start tracking stock.
                            </small>
                            <button
                              className="button primary"
                              onClick={() => setModal("product")}
                            >
                              <Plus size={16} /> Add product
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="panel-heading">
                <h2>Stock movement history</h2>
                <button
                  className="text-button"
                  onClick={() => setModal("scan")}
                >
                  <Camera size={16} /> Receive from photo
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Change</th>
                      <th>Reason</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movementHistory.slice(0, 30).map((m) => (
                      <tr key={m.id}>
                        <td>
                          {
                            state.products.find((p) => p.id === m.productId)
                              ?.name
                          }
                        </td>
                        <td>
                          {m.quantity > 0 ? "+" : ""}
                          {m.quantity}
                        </td>
                        <td>{m.reason}</td>
                        <td>{date(m.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {page === "Record sale" && (
            <div className="checkout-grid">
              <section className="panel">
                <div className="panel-heading">
                  <h2>Select products</h2>
                  <div className="search">
                    <Search size={17} />
                    <input
                      aria-label="Search sale products"
                      placeholder="Find a product…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="product-grid">
                  {filtered.map((p) => (
                    <button
                      disabled={!p.stock}
                      className="product-tile"
                      key={p.id}
                      onClick={() =>
                        setCart({
                          ...cart,
                          [p.id]: Math.min(p.stock, (cart[p.id] || 0) + 1),
                        })
                      }
                    >
                      <span className="product-icon">
                        <Package size={24} />
                      </span>
                      <small>{p.category}</small>
                      <strong>{p.name}</strong>
                      <span>{money(p.price)}</span>
                      <small>
                        {p.stock} {p.unit} available
                      </small>
                      <Plus className="tile-plus" size={17} />
                    </button>
                  ))}
                </div>
                {!state.products.length && (
                  <div className="empty">
                    Add products before recording a sale.
                    <button
                      className="button primary"
                      onClick={() => setModal("product")}
                    >
                      Add product
                    </button>
                  </div>
                )}
              </section>
              <section className="panel checkout">
                <div className="panel-heading">
                  <h2>Current sale</h2>
                  <span className="badge">
                    {Object.keys(cart).length} products
                  </span>
                </div>
                <div className="checkout-body">
                  {Object.entries(cart).map(([id, qty]) => {
                    const p = state.products.find((p) => p.id === id)!;
                    return (
                      <div className="cart-row" key={id}>
                        <div>
                          <strong>{p.name}</strong>
                          <small>
                            {money(p.price)} / {p.unit}
                          </small>
                        </div>
                        <input
                          type="number"
                          aria-label={`Quantity of ${p.name}`}
                          min="1"
                          max={p.stock}
                          value={qty}
                          onChange={(e) =>
                            setCart({ ...cart, [id]: Number(e.target.value) })
                          }
                        />
                        <button
                          className="icon-btn"
                          aria-label={`Remove ${p.name}`}
                          onClick={() => {
                            const next = { ...cart };
                            delete next[id];
                            setCart(next);
                          }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })}
                  {!Object.keys(cart).length && (
                    <p className="muted">Select products to begin.</p>
                  )}
                  <div className="checkout-total">
                    <span>Total</span>
                    <strong>{money(total)}</strong>
                  </div>
                  <label>
                    Customer{" "}
                    <span className="muted">(required for credit)</span>
                    <input
                      value={customer}
                      onChange={(e) => setCustomer(e.target.value)}
                      placeholder="Name / phone or customer reference"
                    />
                  </label>
                  <label>
                    Payment method
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                    >
                      {[
                        "Cash",
                        "Card (external terminal)",
                        "Bank transfer",
                        "Credit",
                      ].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Amount received (₦)
                    <input
                      inputMode="decimal"
                      value={paid}
                      onChange={(e) => setPaid(e.target.value)}
                      placeholder={`${(total / 100).toFixed(2)} — full payment`}
                    />
                  </label>
                  {method !== "Cash" && (
                    <p className="form-note">
                      This records your entry. It does not verify an external
                      payment.
                    </p>
                  )}
                  <button
                    disabled={!ready || busy || !Object.keys(cart).length}
                    className="button primary full"
                    onClick={confirmSale}
                  >
                    <Check size={17} />{" "}
                    {busy ? "Saving…" : "Confirm & save sale"}
                  </button>
                  <p className="form-note">
                    {workspace
                      ? "Saved locally first. Sync runs when connected; external payments are not automatically verified."
                      : "Saved on this device. Connect a cloud workspace in Settings to enable sync."}
                  </p>
                </div>
              </section>
            </div>
          )}
          {page === "Sales history" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>All recorded sales</h2>
                  <p>
                    {state.sales.length} transactions ·{" "}
                    {money(state.sales.reduce((s, x) => s + x.total, 0))} in
                    sales
                  </p>
                </div>
                <button className="button secondary" onClick={exportCSV}>
                  <Download size={16} /> Export CSV
                </button>
              </div>
              {saleTable(state.sales)}
            </section>
          )}
          {page === "Customers & credit" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Outstanding balances</h2>
                  <p>{money(debt)} across unpaid and partially paid sales</p>
                </div>
              </div>
              {saleTable(
                state.sales.filter((s) => paidFor(state, s) < s.total),
              )}
              <div className="panel-heading">
                <button
                  className="button primary"
                  onClick={() => setModal("payment")}
                >
                  <Plus size={16} /> Record debt repayment
                </button>
              </div>
              <div className="panel-heading">
                <h2>Repayment history</h2>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Sale</th>
                      <th>Amount</th>
                      <th>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.payments.map((p) => (
                      <tr key={p.id}>
                        <td>{date(p.createdAt)}</td>
                        <td>SP-{p.saleId.slice(0, 8).toUpperCase()}</td>
                        <td>{money(p.amount)}</td>
                        <td>{p.method}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {page === "Business insights" && (
            <div className="insights-grid">
              <section className="panel insight-detail">
                <span className="insight-kicker">
                  <Package size={18} /> STOCK HEALTH
                </span>
                <h2>
                  {low.length
                    ? `${low.length} products need a stock review`
                    : "Keep your shelves ready"}
                </h2>
                <p>
                  {low.length
                    ? "These products are at or below the alert level you set. Check physical stock and supplier delivery times before ordering."
                    : "No low-stock alerts in your current catalogue. Set thresholds when adding products."}
                </p>
                {low.map((p) => (
                  <div className="insight-evidence" key={p.id}>
                    <strong>{p.name}</strong>
                    <span>
                      {p.stock} {p.unit} remaining / threshold {p.threshold}
                    </span>
                  </div>
                ))}
                <button
                  className="text-button"
                  onClick={() => setPage("Inventory")}
                >
                  Review inventory <ArrowUpRight size={16} />
                </button>
              </section>
              <section className="panel insight-detail">
                <span className="insight-kicker">
                  <Users size={18} /> CUSTOMER CREDIT
                </span>
                <h2>
                  {debt
                    ? `${money(debt)} still to collect`
                    : "Make credit visible"}
                </h2>
                <p>
                  {debt
                    ? "Review customers with unpaid balances before extending more credit. No due dates are recorded yet, so these balances are not labelled overdue."
                    : "Credit sales appear here when a customer pays less than the full sale amount."}
                </p>
                <button
                  className="text-button"
                  onClick={() => setPage("Customers & credit")}
                >
                  Review balances <ArrowUpRight size={16} />
                </button>
              </section>
              <section className="panel insight-detail">
                <span className="insight-kicker">
                  <TrendingUp size={18} /> GROWTH PATTERNS
                </span>
                <h2>Good advice needs enough history.</h2>
                <p>
                  Sales velocity, replenishment forecasts, and product-pair
                  suggestions need consistent sales records over time. This
                  version does not generate forecasts from sparse data.
                </p>
                <div className="insight-evidence">
                  <strong>{state.sales.length} sales recorded</strong>
                  <span>
                    Insights currently use records from this device only.
                  </span>
                </div>
              </section>
            </div>
          )}
          {page === "Settings" && (
            <section className="panel settings-panel">
              <h2>Your data & setup</h2>
              <CloudSettings
                workspace={workspace}
                onWorkspace={switchWorkspace}
                onSync={syncCloud}
                disabled={busy || syncing || !online}
              />
              <hr />
              <p>
                Records are saved in this browser first. A connected Supabase
                workspace syncs while online. Records marked pending sync have
                not been backed up to the cloud. Export a backup regularly;
                clearing browser data can remove local records.
              </p>
              <button
                className="button primary"
                onClick={() =>
                  download(
                    "shopilot-backup.json",
                    JSON.stringify(
                      {
                        version: 1,
                        exportedAt: new Date().toISOString(),
                        ...state,
                      },
                      null,
                      2,
                    ),
                  )
                }
              >
                <Download size={17} /> Export device backup
              </button>
              <hr />
              <h3>Service configuration</h3>
              <p>
                Configure Supabase and Gemini on the server using the project’s
                environment template. Run the Supabase migration before
                connecting. Tenant isolation and sync require integration
                testing against your configured project before live business
                use.
              </p>
              <div className="setup-list">
                <span>
                  Currency<strong>NGN · Nigerian naira</strong>
                </span>
                <span>
                  Business timezone<strong>Africa/Lagos</strong>
                </span>
                <span>
                  Cloud sync
                  <strong>
                    {workspace
                      ? "Configured — see transaction sync status"
                      : "Not connected"}
                  </strong>
                </span>
                <span>
                  Stock recognition
                  <strong>Requires configured Gemini key</strong>
                </span>
              </div>
            </section>
          )}
          {page === "Help" && (
            <section className="panel settings-panel">
              <h2>Start with your products</h2>
              <p>
                Add each product and its opening stock. Choose one explicit
                stock unit, such as “bottle” or “carton of 24”. This first
                version does not automatically convert between units.
              </p>
              <h3>Receiving stock</h3>
              <p>
                Use Receive stock to add a delivery. A negative quantity records
                a correction; always explain the reason. For photo receiving,
                upload an image, request suggestions, map each row to an
                existing product, check quantities in that product’s unit, and
                confirm.
              </p>
              <h3>Recording sales offline</h3>
              <p>
                Open the production app online once to prepare the offline page.
                Add your catalogue before disconnecting. Sales save to this
                browser’s device storage. Keep this device secure and export
                backups. Offline reload must be verified on your target device
                before relying on it.
              </p>
              <h3>What “device only” means</h3>
              <p>
                Records have not reached a cloud database. Connected cloud
                workspaces synchronise while online. Simultaneous offline sales
                can create stock conflicts; reconcile them against a physical
                count. Card and transfer entries record what staff entered, not
                confirmation from a payment provider.
              </p>
              <h3>Current development boundaries</h3>
              <p>
                Cloud authentication and sync require configured Supabase
                credentials and database migration. Returns, split payments,
                unit conversions, and subscription billing are not complete. Do
                not treat this development build as production-ready.
              </p>
            </section>
          )}
          <footer className="main-footer">
            <span>
              Shopilot · A little more control. A lot more possibility.
            </span>
            <span>
              <span className="live-dot" /> Device storage{" "}
              {ready ? "ready" : "loading"}
              {offlineReady ? " · Offline page ready" : ""}
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <div className="modal-overlay">
          <section
            className={"modal " + (modal === "scan" ? "wide" : "")}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "product"
                ? "Add product"
                : modal === "receive"
                  ? "Receive stock"
                  : modal === "payment"
                    ? "Record debt repayment"
                    : "Scan stock"
            }
          >
            <div className="modal-heading">
              <div>
                <h2>
                  {modal === "product"
                    ? "Add a product"
                    : modal === "receive"
                      ? "Receive or adjust stock"
                      : modal === "payment"
                        ? "Record debt repayment"
                        : "From photo to stock"}
                </h2>
                <p>
                  {modal === "scan"
                    ? "Suggestions first. Your confirmation always."
                    : "Make your inventory a little clearer."}
                </p>
              </div>
              <button
                className="icon-btn"
                aria-label="Close dialog"
                onClick={() => {
                  setModal(null);
                  setError("");
                }}
              >
                <X size={20} />
              </button>
            </div>
            {error && (
              <div className="banner error" role="alert">
                {error}
              </div>
            )}
            {modal === "product" && (
              <form onSubmit={addProduct}>
                <label>
                  Product name
                  <input
                    name="name"
                    required
                    placeholder="e.g. Coca-Cola 50cl"
                    maxLength={120}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Category
                    <input name="category" placeholder="e.g. Drinks" />
                  </label>
                  <label>
                    Stock unit
                    <input
                      name="unit"
                      required
                      placeholder="e.g. carton of 24"
                    />
                  </label>
                  <label>
                    Cost per unit (₦)
                    <input
                      name="cost"
                      inputMode="decimal"
                      required
                      defaultValue="0"
                    />
                  </label>
                  <label>
                    Selling price per unit (₦)
                    <input name="price" inputMode="decimal" required />
                  </label>
                  <label>
                    Opening stock
                    <input
                      name="stock"
                      type="number"
                      min="0"
                      step="1"
                      required
                      defaultValue="0"
                    />
                  </label>
                  <label>
                    Low-stock threshold
                    <input
                      name="threshold"
                      type="number"
                      min="0"
                      step="1"
                      required
                      defaultValue="5"
                    />
                  </label>
                </div>
                <p className="form-note">
                  Quantities refer to the stock unit above. Pack conversions are
                  not automatic in this version.
                </p>
                <button
                  className="button primary full"
                  disabled={busy || !ready}
                >
                  Save product
                </button>
              </form>
            )}
            {modal === "receive" && (
              <form onSubmit={receive}>
                <label>
                  Product
                  <select name="product" required>
                    <option value="">Select a product</option>
                    {state.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.unit}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity change
                  <input
                    name="quantity"
                    type="number"
                    step="1"
                    required
                    placeholder="e.g. 10 (or -2 for damage)"
                  />
                </label>
                <label>
                  Reason / supplier reference
                  <input
                    name="reason"
                    required
                    placeholder="e.g. Delivery from supplier / damaged goods"
                  />
                </label>
                <button
                  className="button primary full"
                  disabled={busy || !ready}
                >
                  Confirm stock change
                </button>
              </form>
            )}
            {modal === "payment" && (
              <form onSubmit={repay}>
                <label>
                  Outstanding sale
                  <select name="sale" required>
                    <option value="">Select customer and sale</option>
                    {state.sales
                      .filter((s) => paidFor(state, s) < s.total)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.customer} — SP-{s.id.slice(0, 8).toUpperCase()} —{" "}
                          {money(s.total - paidFor(state, s))}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Amount received (₦)
                  <input name="amount" required inputMode="decimal" />
                </label>
                <label>
                  Payment method
                  <select name="method">
                    <option>Cash</option>
                    <option>Card (external terminal)</option>
                    <option>Bank transfer</option>
                  </select>
                </label>
                <p className="form-note">
                  This creates a separate payment record. It does not count as a
                  new sale or verify a bank payment.
                </p>
                <button className="button primary full" disabled={busy}>
                  Save repayment
                </button>
              </form>
            )}
            {modal === "scan" && (
              <>
                <div className="scan-layout">
                  <div>
                    <label className="upload-box">
                      <Camera size={32} />
                      <strong>Take or upload a stock photo</strong>
                      <span>JPEG, PNG or WebP · maximum 3 MB</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        onChange={(e) =>
                          e.target.files?.[0] && scanPhoto(e.target.files[0])
                        }
                      />
                    </label>
                    {image && (
                      <img
                        className="stock-photo"
                        src={image}
                        alt="Stock photo to review"
                      />
                    )}
                    <button
                      className="button secondary full"
                      disabled={!image || scanning || !online}
                      onClick={analyse}
                    >
                      <Sparkles size={16} />
                      {scanning
                        ? "Reading your photo…"
                        : "Suggest stock from photo"}
                    </button>
                    <p className="form-note">
                      Online connection and server-side Gemini configuration
                      required. Hidden stock and pack sizes may be
                      misidentified.
                    </p>
                  </div>
                  <div>
                    <h3>Review suggested items</h3>
                    <p className="muted">
                      Match products and enter quantities in their configured
                      stock unit.
                    </p>
                    {scan.map((row, i) => (
                      <div className="scan-row" key={i}>
                        <div>
                          <strong>{row.name}</strong>
                          <button
                            className="icon-btn"
                            aria-label="Remove suggested row"
                            onClick={() =>
                              setScan(scan.filter((_, j) => j !== i))
                            }
                          >
                            <X size={14} />
                          </button>
                        </div>
                        {row.unit && (
                          <small>
                            Detected package: {row.unit}. Check this matches the
                            selected product unit.
                          </small>
                        )}
                        <select
                          aria-label={`Match ${row.name}`}
                          value={row.productId}
                          onChange={(e) =>
                            setScan(
                              scan.map((r, j) =>
                                j === i
                                  ? { ...r, productId: e.target.value }
                                  : r,
                              ),
                            )
                          }
                        >
                          <option value="">Choose matching product</option>
                          {state.products.map((p) => (
                            <option value={p.id} key={p.id}>
                              {p.name} ({p.unit})
                            </option>
                          ))}
                        </select>
                        <label>
                          Quantity in{" "}
                          {state.products.find((p) => p.id === row.productId)
                            ?.unit || "selected product units"}
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={row.quantity}
                            onChange={(e) =>
                              setScan(
                                scan.map((r, j) =>
                                  j === i
                                    ? { ...r, quantity: Number(e.target.value) }
                                    : r,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                    ))}
                    <button
                      className="text-button"
                      onClick={() =>
                        setScan([
                          ...scan,
                          {
                            name: "Manual entry",
                            quantity: 1,
                            unit: "",
                            productId: "",
                          },
                        ])
                      }
                    >
                      <Plus size={16} /> Add review row manually
                    </button>
                  </div>
                </div>
                <button
                  className="button primary full"
                  disabled={!scan.length || busy}
                  onClick={confirmScan}
                >
                  <Check size={17} /> Confirm reviewed stock
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {receipt && (
        <div className="modal-overlay receipt-overlay">
          <section
            className="modal receipt"
            role="dialog"
            aria-modal="true"
            aria-label="Sale receipt"
          >
            <div className="receipt-brand">{workspace?.name}</div>
            {(workspace?.address || workspace?.phone) && (
              <p>
                {workspace.address}
                <br />
                {workspace.phone}
              </p>
            )}
            <p>SALE RECEIPT · DEVICE COPY</p>
            <h3>SP-{receipt.id.slice(0, 8).toUpperCase()}</h3>
            <p>
              {date(receipt.createdAt)}
              <br />
              {receipt.customer || "Walk-in customer"}
            </p>
            <hr />
            {receipt.lines.map((l, i) => (
              <div className="receipt-line" key={i}>
                <div>
                  {l.name}
                  <small>
                    {l.quantity} {l.unit} × {money(l.price)}
                  </small>
                </div>
                <strong>{money(l.quantity * l.price)}</strong>
              </div>
            ))}
            <hr />
            <div className="receipt-line">
              <strong>Total</strong>
              <strong>{money(receipt.total)}</strong>
            </div>
            <div className="receipt-line">
              <span>Payment recorded</span>
              <span>{money(paidFor(state, receipt))}</span>
            </div>
            <div className="receipt-line">
              <span>Balance</span>
              <span>{money(receipt.total - paidFor(state, receipt))}</span>
            </div>
            <p>
              Method: {receipt.method}
              <br />
              Thank you for shopping with us. · Powered by Shopilot
            </p>
            <small>
              {receipt.sync === "synced"
                ? "Cloud synced"
                : "Saved locally · Cloud sync pending"}
              <br />
              Reference: {receipt.id}
            </small>
            <div className="receipt-actions">
              <button
                className="button secondary"
                onClick={() => setReceipt(null)}
              >
                Close
              </button>
              <button className="button primary" onClick={() => window.print()}>
                Print / Save PDF
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
