"use client";
import { useEffect, useState } from "react";
import { Download, ShieldCheck, Upload } from "lucide-react";
import { readSaveStatus, type SaveStatus } from "../lib/storage";
import { parseBackup } from "../lib/backup";
import type { State } from "../lib/domain";
export default function DataProtection({
  businessId,
  state,
  canRestore,
  onRestore,
}: {
  businessId: string;
  state: State;
  canRestore: boolean;
  onRestore: (backup: State) => Promise<void>;
}) {
  const [status, setStatus] = useState<SaveStatus | null>(null),
    [persistent, setPersistent] = useState<boolean | null>(null),
    [message, setMessage] = useState(""),
    [backup, setBackup] = useState<State | null>(null),
    [busy, setBusy] = useState(false),
    [usage, setUsage] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      readSaveStatus(businessId)
        .then(setStatus)
        .catch(() =>
          setMessage(
            "Could not check pending saves. Keep this device available until your records are saved.",
          ),
        );
    };
    update();
    window.addEventListener("shopilot-save-status", update);
    navigator.storage?.persisted?.().then(setPersistent);
    navigator.storage?.estimate?.().then((e) => {
      if (e.quota) setUsage((e.usage || 0) / e.quota);
    });
    return () => window.removeEventListener("shopilot-save-status", update);
  }, [businessId]);
  function exportBackup() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              version: 2,
              businessId,
              exportedAt: new Date().toISOString(),
              ...state,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `shopilot-${businessId.slice(0, 8)}-backup.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function protect() {
    try {
      if (!navigator.storage?.persist) {
        setMessage(
          "This browser does not support protected offline storage. Keep cloud saves up to date and export backups.",
        );
        return;
      }
      const granted = await navigator.storage.persist();
      setPersistent(granted);
      setMessage(
        granted
          ? "This browser has granted persistent storage. Your saved account records remain the recovery source if this device is cleared."
          : "This browser did not grant persistent storage. Shopilot will continue saving to your account while connected.",
      );
    } catch {
      setMessage(
        "Could not request protected storage. Your current records have not been changed.",
      );
    }
  }
  async function inspect(file: File) {
    setMessage("");
    setBackup(null);
    try {
      if (file.size > 20_000_000)
        throw new Error("Choose a backup smaller than 20 MB.");
      setBackup(parseBackup(await file.text(), businessId));
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <section className="settings-section">
      <h3>
        <ShieldCheck size={18} /> Keep your records recoverable
      </h3>
      {message && (
        <div className="banner" role="status">
          {message}
        </div>
      )}
      <div className="setup-list">
        <span>
          Pending changes
          <strong>{status ? status.pendingIds.length : "Checking…"}</strong>
        </span>
        <span>
          Last account save
          <strong>
            {status?.lastSyncedAt
              ? new Date(status.lastSyncedAt).toLocaleString("en-NG", {
                  timeZone: "Africa/Lagos",
                })
              : "No completed save on this device yet"}
          </strong>
        </span>
        <span>
          Offline storage
          <strong>
            {persistent === null
              ? "Not checked"
              : persistent
                ? "Persistent storage granted"
                : "Standard browser storage"}
          </strong>
        </span>
      </div>
      {usage !== null && usage > 0.85 && (
        <div className="banner error">
          This device is running low on browser storage. Save your pending
          changes and export a backup before clearing anything.
        </div>
      )}
      <p>
        Shopilot saves online after each change and retries when you reconnect.
        A new device can restore the records already saved to your account.
        Changes still waiting on this device need to finish saving before you
        clear or replace it.
      </p>
      <button
        className="button secondary"
        onClick={protect}
        disabled={persistent === true}
      >
        <ShieldCheck size={16} /> Keep offline records on this device
      </button>
      <button className="button secondary" onClick={exportBackup}>
        <Download size={16} /> Export business backup
      </button>
      <p>
        Browser permissions reduce eviction risk; they cannot prevent someone
        clearing browser data or losing a device. Keep a separate backup for
        work that has not reached your account.
      </p>
      {canRestore && (
        <>
          <label className="backup-upload">
            <Upload size={16} /> Inspect a backup to recover records
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) inspect(file);
                e.target.value = "";
              }}
            />
          </label>
          {backup && (
            <div className="backup-review">
              <strong>Backup ready to merge</strong>
              <p>
                {backup.products.length} products · {backup.sales.length} sales
                · {backup.payments.length} repayments. Existing records stay in
                place. Matching operation references are not added twice.
              </p>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  onRestore(backup)
                    .then(() => {
                      setBackup(null);
                      setMessage(
                        "Backup merged on this device. Shopilot will save the recovered records to your account when connected.",
                      );
                    })
                    .catch((e) => setMessage(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                Merge backup into this business
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
