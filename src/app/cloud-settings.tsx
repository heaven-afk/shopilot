"use client";
import { useState } from "react";
import { Cloud, LogOut, RefreshCw } from "lucide-react";
export type Workspace = {
  id: string;
  name: string;
  business_type?: string;
  phone?: string;
  address?: string;
};
export default function CloudSettings({
  workspace,
  onWorkspace,
  onSync,
  disabled,
}: {
  workspace: Workspace | null;
  onWorkspace: (workspace: Workspace | null) => Promise<void>;
  onSync: () => Promise<void>;
  disabled: boolean;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
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
