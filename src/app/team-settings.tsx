"use client";
import { useEffect, useState } from "react";
import { Copy, Plus, Users } from "lucide-react";
import { getSupabase } from "../lib/supabase";
import type { Team, Workspace } from "../lib/contracts";
export default function TeamSettings({ workspace }: { workspace: Workspace }) {
  const [team, setTeam] = useState<Team | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [link, setLink] = useState("");
  const client = getSupabase();
  async function load() {
    if (!client) return;
    const result = await client.rpc("business_team", { bid: workspace.id });
    if (result.error) {
      setMessage(
        "Team settings are temporarily unavailable. Please try again after your account is updated.",
      );
      return;
    }
    setTeam(result.data);
  }
  useEffect(() => {
    if (workspace.role === "owner") load();
  }, [workspace.id, workspace.role]);
  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const result = await client.rpc("invite_staff", {
        bid: workspace.id,
        staff_email: String(form.get("email")),
        staff_role: String(form.get("role")),
      });
      if (result.error) throw result.error;
      setLink(
        `${window.location.origin}/?invite=${encodeURIComponent(result.data)}`,
      );
      setMessage(
        "Invitation created for seven days. Share the link with this person; they must sign in using the invited email.",
      );
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function change(userId: string, newRole: string) {
    if (!client) return;
    setBusy(true);
    try {
      const result = await client.rpc("update_team_access", {
        bid: workspace.id,
        target_user: userId,
        new_role: newRole,
      });
      if (result.error) throw result.error;
      setMessage(
        "Team access updated. Changes apply when the device reconnects.",
      );
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    if (!client) return;
    setBusy(true);
    try {
      const result = await client.rpc("revoke_staff_invitation", {
        bid: workspace.id,
        invitation_id: id,
      });
      if (result.error) throw result.error;
      await load();
      setMessage("Invitation revoked.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (workspace.role !== "owner")
    return (
      <section className="settings-section">
        <h3>
          <Users size={18} /> Team access
        </h3>
        <p>
          Your role is {workspace.role || "staff"}. The business owner manages
          invitations and permissions.
        </p>
      </section>
    );
  return (
    <section className="settings-section">
      <h3>
        <Users size={18} /> Team & permissions
      </h3>
      <p>
        Sales staff can record sales and repayments. Managers can also add
        products and receive stock. Only the owner manages the team and business
        branding.
      </p>
      {message && (
        <div className="banner" role="status">
          {message}
        </div>
      )}
      <form className="settings-form" onSubmit={invite}>
        <label>
          Staff email
          <input
            type="email"
            name="email"
            required
            placeholder="colleague@example.com"
          />
        </label>
        <label>
          Role
          <select name="role">
            <option value="staff">Sales staff</option>
            <option value="manager">Manager</option>
          </select>
        </label>
        <button className="button primary" disabled={busy}>
          <Plus size={16} /> Create invitation
        </button>
      </form>
      {link && (
        <div className="invitation-link">
          <label>
            Share this invitation
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
          </label>
          <button
            className="button secondary"
            onClick={() =>
              navigator.clipboard
                .writeText(link)
                .then(() => setMessage("Invitation link copied."))
                .catch(() =>
                  setMessage("Select and copy the invitation link above."),
                )
            }
          >
            <Copy size={15} /> Copy link
          </button>
        </div>
      )}
      {team?.members.map((member) => (
        <div className="team-row" key={member.userId}>
          <span>
            {member.email}
            <small>{member.role}</small>
          </span>
          {member.role === "owner" ? (
            <strong>Owner</strong>
          ) : (
            <select
              aria-label={`Role for ${member.email}`}
              value={member.role}
              disabled={busy}
              onChange={(e) => change(member.userId, e.target.value)}
            >
              <option value="staff">Sales staff</option>
              <option value="manager">Manager</option>
              <option value="remove">Remove access</option>
            </select>
          )}
        </div>
      ))}
      {team?.invitations
        .filter((i) => !i.acceptedAt && !i.revokedAt)
        .map((i) => (
          <div className="team-row" key={i.id}>
            <span>
              {i.email}
              <small>
                {new Date(i.expiresAt) > new Date() ? "Pending" : "Expired"} ·{" "}
                {i.role}
              </small>
            </span>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => revoke(i.id)}
            >
              Revoke
            </button>
          </div>
        ))}
    </section>
  );
}
