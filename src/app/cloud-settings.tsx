"use client";
import { useState } from "react";
import { Cloud, LogOut, RefreshCw } from "lucide-react";
import { getSupabase } from "../lib/supabase";
import TeamSettings from "./team-settings";
import type { Workspace } from "../lib/contracts";
export type { Workspace } from "../lib/contracts";
export default function CloudSettings({
  workspace,
  onWorkspace,
  onSync,
  disabled,
  onSaved,
}: {
  workspace: Workspace | null;
  onWorkspace: (workspace: Workspace | null) => Promise<void>;
  onSync: () => Promise<void>;
  disabled: boolean;
  onSaved: (workspace: Workspace) => void;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    const form = new FormData(event.currentTarget),
      client = getSupabase();
    if (!client) return;
    setBusy(true);
    setMessage("");
    try {
      const details: Workspace = {
        id: workspace.id,
        name: String(form.get("name")).trim(),
        business_type: String(form.get("business_type")),
        phone: String(form.get("phone")).trim(),
        address: String(form.get("address")).trim(),
        receipt_footer: String(form.get("receipt_footer")),
        receipt_width: Number(form.get("receipt_width")) as 58 | 80,
        logo_url: String(form.get("logo_url")).trim(),
      };
      const result = await client.rpc("update_business_settings", {
        bid: workspace.id,
        details,
      });
      if (result.error) throw result.error;
      onSaved({ ...result.data, role: workspace.role });
      setMessage(
        "Business details saved. Your next receipts will use this branding.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cloud-settings">
      <h3>
        <Cloud size={18} /> Your business workspace
      </h3>
      {message && (
        <div className="banner" role="status">
          {message}
        </div>
      )}
      <div className="setup-list">
        <span>
          Business name<strong>{workspace?.name}</strong>
        </span>
        <span>
          Business type
          <strong>{workspace?.business_type || "Retail shop"}</strong>
        </span>
        <span>
          Phone<strong>{workspace?.phone || "Not provided"}</strong>
        </span>
        <span>
          Address<strong>{workspace?.address || "Not provided"}</strong>
        </span>
      </div>
      {workspace?.role === "owner" && (
        <form
          onSubmit={save}
          className="settings-form"
          key={workspace.name + workspace.receipt_footer + workspace.logo_url}
        >
          <h3>Business details & receipt branding</h3>
          <label>
            Business name
            <input
              name="name"
              required
              maxLength={120}
              defaultValue={workspace.name}
            />
          </label>
          <label>
            Business type
            <select
              name="business_type"
              defaultValue={workspace.business_type || "Retail shop"}
            >
              <option>Retail shop</option>
              <option>Wholesaler</option>
              <option>Retail & wholesale</option>
              <option>Other small business</option>
            </select>
          </label>
          <label>
            Business phone
            <input
              name="phone"
              type="tel"
              maxLength={40}
              defaultValue={workspace.phone || ""}
              autoComplete="tel"
            />
          </label>
          <label>
            Business address
            <input
              name="address"
              maxLength={300}
              defaultValue={workspace.address || ""}
              autoComplete="street-address"
            />
          </label>
          <label>
            Receipt message
            <input
              name="receipt_footer"
              maxLength={240}
              defaultValue={
                workspace.receipt_footer || "Thank you for shopping with us."
              }
            />
          </label>
          <label>
            Logo image URL (optional)
            <input
              name="logo_url"
              type="url"
              pattern="https://.*"
              maxLength={1000}
              defaultValue={workspace.logo_url || ""}
              placeholder="https://…"
            />
          </label>
          <label>
            Receipt printer width
            <select
              name="receipt_width"
              defaultValue={workspace.receipt_width || 80}
            >
              <option value={80}>80 mm</option>
              <option value={58}>58 mm</option>
            </select>
          </label>
          <button className="button primary" disabled={busy || disabled}>
            Save business settings
          </button>
          <p>
            New sales keep a copy of your receipt branding, so later changes
            won’t rewrite those receipts.
          </p>
        </form>
      )}
      {workspace && <TeamSettings workspace={workspace} />}
      <p>
        Your business has its own inventory, sales, and customers. Records are
        saved to this device first and synchronised when connected.
      </p>
      <button
        className="button primary"
        disabled={busy || disabled}
        onClick={() => {
          setBusy(true);
          onSync()
            .catch((e) => setMessage(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <RefreshCw size={16} /> Sync now
      </button>
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          onWorkspace(null)
            .catch((e) => setMessage(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <LogOut size={16} /> Sign out
      </button>
    </div>
  );
}
