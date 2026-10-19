"use client";
import { useEffect, useState, useRef } from "react";
import {
  Building2,
  Users,
  Activity,
  Camera,
  RefreshCw,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import { getSupabase } from "../../lib/supabase";
import type { PlatformDashboard, PlatformRole } from "../../lib/contracts";
export default function Admin() {
  const [role, setRole] = useState<PlatformRole | null>(null),
    [data, setData] = useState<PlatformDashboard | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(true),
    [signedIn, setSignedIn] = useState(false);
  const client = getSupabase();
  const generation = useRef(0);
  async function load() {
    const revision = ++generation.current;
    setBusy(true);
    setMessage("");
    try {
      if (!navigator.onLine)
        throw new Error(
          "Connect to the internet to monitor current platform activity.",
        );
      if (!client) throw new Error("The account service is not connected.");
      const {
        data: { session },
      } = await client.auth.getSession();
      if (revision !== generation.current) return;
      setSignedIn(Boolean(session));
      if (!session) {
        setRole(null);
        return;
      }
      const access = await client.rpc("platform_access");
      if (revision !== generation.current) return;
      if (access.error || !access.data) {
        setRole(null);
        throw new Error("This account does not have Shopilot platform access.");
      }
      setRole(access.data);
      const result = await client.rpc("platform_dashboard");
      if (revision !== generation.current) return;
      if (result.error) throw result.error;
      setData(result.data);
    } catch (e) {
      if (revision !== generation.current) return;
      setData(null);
      setMessage((e as Error).message);
    } finally {
      if (revision === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    load();
    const { data } = client?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
        generation.current++;
        setData(null);
        setRole(null);
        setSignedIn(event === "SIGNED_IN");
        if (event === "SIGNED_IN") setTimeout(() => load(), 0);
      }
    }) || { data: null };
    const refresh = () => {
      load();
    };
    const offline = () => {
      generation.current++;
      setData(null);
      setRole(null);
      setMessage(
        "Connect to the internet to monitor current platform activity.",
      );
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", offline);
    const timer = setInterval(refresh, 60000);
    return () => {
      generation.current++;
      data?.subscription.unsubscribe();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline);
    };
  }, [client]);
  async function access(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await client.rpc("set_platform_access", {
        target_email: String(form.get("email")),
        access_role: String(form.get("role")),
      });
      if (result.error) throw result.error;
      await load();
      setMessage("Platform access updated.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="platform-admin">
      <header className="platform-heading">
        <div>
          <span className="eyebrow">SHOPILOT · PRIVATE OPERATIONS</span>
          <h1>Platform overview</h1>
          <p>
            Registered businesses, activity, and access. Billing is on hold.
          </p>
        </div>
        <a className="button secondary" href="/">
          <ArrowLeft size={16} /> Back to business
        </a>
      </header>
      {message && (
        <div className="banner" role="status">
          {message}
        </div>
      )}
      {busy && !data ? (
        <div className="panel settings-panel">Checking platform access…</div>
      ) : !role || !data ? (
        <section className="panel settings-panel">
          <ShieldCheck size={28} />
          <h2>Private platform area</h2>
          <p>
            Only accounts explicitly authorised by the Shopilot platform owner
            can access this dashboard. A business owner account does not
            automatically have platform access.
          </p>
          {!signedIn && (
            <a className="button primary" href="/?next=/admin">
              Sign in to continue
            </a>
          )}
          <button className="button secondary" onClick={load}>
            Check access again
          </button>
        </section>
      ) : (
        <>
          <div className="platform-toolbar">
            <span>Access: {role} · Database activity, not server uptime</span>
            <button className="button secondary" disabled={busy} onClick={load}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
          <div className="stats">
            {[
              {
                label: "Businesses",
                value: data.businessCount,
                Icon: Building2,
              },
              {
                label: "Registered accounts",
                value: data.accountCount,
                Icon: Users,
              },
              {
                label: "Active businesses · 24h",
                value: data.activeBusinesses,
                Icon: Activity,
              },
              { label: "Scans today", value: data.scansToday, Icon: Camera },
            ].map(({ label, value, Icon }) => (
              <section className="stat" key={label}>
                <div className="stat-label">
                  {label}
                  <Icon size={18} />
                </div>
                <div className="stat-value">{value}</div>
              </section>
            ))}
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Business activity</h2>
                <p>
                  {data.staffCount} staff memberships · {data.salesCount}{" "}
                  recorded sales. Latest 200 businesses.
                </p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Owner</th>
                    <th>Members</th>
                    <th>Sales</th>
                    <th>Last successful save</th>
                  </tr>
                </thead>
                <tbody>
                  {data.businesses.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <strong>{b.name}</strong>
                        <small>{b.business_type}</small>
                      </td>
                      <td>{b.owner_email}</td>
                      <td>{b.members}</td>
                      <td>{b.sales}</td>
                      <td>
                        {b.last_synced_at
                          ? new Date(b.last_synced_at).toLocaleString("en-NG", {
                              timeZone: "Africa/Lagos",
                            })
                          : "No save recorded yet"}
                      </td>
                    </tr>
                  ))}
                  {!data.businesses.length && (
                    <tr>
                      <td colSpan={5}>No businesses registered yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel settings-panel">
            <h2>Platform access</h2>
            <p>
              Owner access can grant or remove other administrators. Admin and
              viewer access can monitor activity. This does not grant access to
              customer sale details or change business ownership.
            </p>
            {data.administrators.map((a) => (
              <div className="team-row" key={a.userId}>
                <span>{a.email}</span>
                <strong>{a.role}</strong>
              </div>
            ))}
            {role === "owner" && (
              <form onSubmit={access} className="settings-form">
                <label>
                  Registered, confirmed email
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="off"
                  />
                </label>
                <label>
                  Access
                  <select name="role">
                    <option value="viewer">Viewer</option>
                    <option value="admin">Administrator</option>
                    <option value="owner">Platform owner</option>
                    <option value="remove">Remove platform access</option>
                  </select>
                </label>
                <button className="button primary" disabled={busy}>
                  Update platform access
                </button>
              </form>
            )}
            <h3>Recent access changes</h3>
            {data.audit.map((entry, index) => (
              <p key={index}>
                {entry.action.replaceAll("_", " ")} · {entry.actor_email} →{" "}
                {entry.target_email} ·{" "}
                {new Date(entry.created_at).toLocaleString("en-NG", {
                  timeZone: "Africa/Lagos",
                })}
              </p>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
