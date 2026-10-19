"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRight,
  Check,
  Package,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { getSupabase } from "../lib/supabase";
import { setStorageScope } from "../lib/storage";
import type { Workspace } from "./cloud-settings";
import PasswordField from "./password-field";
type Access = {
  workspace: Workspace;
  userId: string;
  email: string;
  ownerName: string;
};
const CACHE = "shopilot-authorised-business-v1";
const fields = "id,name,business_type,phone,address";
export default function AccessGate({
  children,
}: {
  children: (access: Access, onExit: () => Promise<void>) => ReactNode;
}) {
  const [view, setView] = useState<
    "loading" | "login" | "signup" | "confirm" | "setup" | "recovery"
  >("loading");
  const [access, setAccess] = useState<Access | null>(null);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [ownerName, setOwnerName] = useState("");
  const [businessName, setBusinessName] = useState(""),
    [businessType, setBusinessType] = useState("Retail shop"),
    [phone, setPhone] = useState(""),
    [address, setAddress] = useState("");
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const client = getSupabase(),
    generation = useRef(0);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => reg.active?.postMessage("CACHE_SHELL"))
        .catch(() => {});
    }
  }, []);
  useEffect(() => {
    if (!client) {
      setView("login");
      return;
    }
    let alive = true;
    async function restore(session: Session | null) {
      const revision = ++generation.current;
      if (!session) {
        if (alive) {
          setAccess(null);
          setView("login");
          setStorageScope(null);
          localStorage.removeItem(CACHE);
        }
        return;
      }
      try {
        if (!navigator.onLine) {
          const saved = JSON.parse(
            localStorage.getItem(CACHE) || "null",
          ) as Access | null;
          if (saved?.userId === session.user.id) {
            setStorageScope(saved.workspace.id);
            if (alive) {
              setAccess(saved);
              setView("login");
            }
            return;
          }
          throw new Error(
            "Connect to the internet to prepare this business on this device.",
          );
        }
        const { data, error } = await client!
          .from("businesses")
          .select(fields)
          .limit(1)
          .abortSignal(AbortSignal.timeout(15000))
          .maybeSingle();
        if (error) throw error;
        if (!alive || generation.current !== revision) return;
        if (!data) {
          setAccess(null);
          setView("setup");
          return;
        }
        const next: Access = {
          workspace: data as Workspace,
          userId: session.user.id,
          email: session.user.email || "",
          ownerName:
            session.user.user_metadata?.owner_name ||
            session.user.email?.split("@")[0] ||
            "Business owner",
        };
        setStorageScope(next.workspace.id);
        localStorage.setItem(CACHE, JSON.stringify(next));
        setAccess(next);
        setView("login");
        setPassword("");
      } catch (e) {
        if (alive && generation.current === revision) {
          setAccess(null);
          setView("login");
          setMessage(`Could not open your business: ${(e as Error).message}`);
        }
      }
    }
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        return restore(data.session);
      })
      .catch(() => {
        if (alive) {
          setView("login");
          setMessage("Please sign in again to open your business.");
        }
      });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      if (event === "PASSWORD_RECOVERY") {
        setAccess(null);
        setView("recovery");
        return;
      }
      setTimeout(() => {
        if (alive) restore(session);
      }, 0);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
      generation.current++;
    };
  }, [client]);
  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const form = new FormData(event.currentTarget);
    const submittedEmail = String(form.get("email") || "").trim();
    const submittedPassword = String(form.get("password") || "");
    const submittedOwnerName = String(form.get("ownerName") || "").trim();
    setEmail(submittedEmail);
    setPassword(submittedPassword);
    setBusy(true);
    setMessage("");
    try {
      const result =
        view === "signup"
          ? await client.auth.signUp({
              email: submittedEmail,
              password: submittedPassword,
              options: { data: { owner_name: submittedOwnerName } },
            })
          : await client.auth.signInWithPassword({
              email: submittedEmail,
              password: submittedPassword,
            });
      if (result.error) throw result.error;
      if (!result.data.session) {
        setView("confirm");
        setPassword("");
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function setup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const form = new FormData(event.currentTarget);
    const details = {
      name: String(form.get("businessName") || "").trim(),
      type: String(form.get("businessType") || "Retail shop"),
      phone: String(form.get("phone") || "").trim(),
      address: String(form.get("address") || "").trim(),
    };
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await client.rpc("setup_business", {
        workspace_name: details.name,
        business_type: details.type,
        business_phone: details.phone,
        business_address: details.address,
      });
      if (error) throw error;
      const {
        data: { session },
      } = await client.auth.getSession();
      if (!session) throw new Error("Your session expired. Sign in again.");
      const next: Access = {
        workspace: {
          id: data,
          name: details.name,
          business_type: details.type,
          phone: details.phone,
          address: details.address,
        },
        userId: session.user.id,
        email: session.user.email || "",
        ownerName: session.user.user_metadata?.owner_name || "Business owner",
      };
      setStorageScope(data);
      localStorage.setItem(CACHE, JSON.stringify(next));
      setAccess(next);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exit() {
    if (client) {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) {
        setMessage(error.message);
        throw error;
      }
    }
    generation.current++;
    localStorage.removeItem(CACHE);
    setStorageScope(null);
    setAccess(null);
    setPassword("");
    setView("login");
  }
  async function resetPassword() {
    const enteredEmail =
      (
        document.getElementById("account-email") as HTMLInputElement | null
      )?.value.trim() || email.trim();
    if (!client || !enteredEmail) {
      setMessage("Enter your account email first.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await client.auth.resetPasswordForEmail(enteredEmail, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setMessage(
        "If an account exists for this email, you will receive a password reset link.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const submittedPassword = String(
      new FormData(event.currentTarget).get("password") || "",
    );
    setBusy(true);
    try {
      const { error } = await client.auth.updateUser({
        password: submittedPassword,
      });
      if (error) throw error;
      await exit();
      setMessage("Password updated. Sign in with your new password.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (access) return children(access, exit);
  return (
    <main className="access-shell">
      <section className="access-story">
        <a href="/" className="brand">
          <span className="brand-icon">
            <ShoppingBag size={23} />
          </span>
          shopilot<span className="brand-dot">.</span>
        </a>
        <div className="access-story-body">
          <span className="access-tag">
            <Sparkles size={14} /> A CLEARER WAY TO RUN YOUR SHOP
          </span>
          <h1>
            Your business. <br />
            Ready for its <br />
            <em>next chapter.</em>
          </h1>
          <p>
            From the first carton to the last sale of the day. Keep your stock,
            sales, and customer balances together.
          </p>
          <div className="access-benefits">
            <span>
              <Check size={16} /> Know what’s on your shelves
            </span>
            <span>
              <Check size={16} /> Keep selling when the internet drops
            </span>
            <span>
              <Check size={16} /> Make your next decision with clarity
            </span>
          </div>
        </div>
        <div className="access-story-foot">
          <Package size={17} /> Built for shops, retailers & wholesalers.
        </div>
      </section>
      <section className="access-form-side">
        <div className="access-form-card">
          {view === "loading" ? (
            <>
              <span className="access-step">WELCOME TO SHOPILOT</span>
              <h2>Opening your workspace…</h2>
              <p>Checking your sign-in and business.</p>
            </>
          ) : (
            <>
              <span className="access-step">
                {view === "setup"
                  ? "STEP 2 OF 2 · YOUR BUSINESS"
                  : view === "signup"
                    ? "STEP 1 OF 2 · YOUR ACCOUNT"
                    : "YOUR BUSINESS STARTS HERE"}
              </span>
              <h2>
                {view === "signup"
                  ? "Create your owner account"
                  : view === "setup"
                    ? "Tell us about your business"
                    : view === "confirm"
                      ? "Check your inbox"
                      : view === "recovery"
                        ? "Choose a new password"
                        : "Welcome back."}
              </h2>
              <p>
                {view === "signup"
                  ? "One account. A workspace that belongs to your business."
                  : view === "setup"
                    ? "We’ll create a private workspace with empty inventory and sales records."
                    : view === "confirm"
                      ? `We sent a confirmation link to ${email}. Confirm your email, then sign in to set up your business.`
                      : view === "recovery"
                        ? "Choose a unique password you don’t use on another account."
                        : "Sign in to pick up where your business left off."}
              </p>
              {message && (
                <div className="banner" role="status">
                  {message}
                </div>
              )}
              {!client && (
                <div className="auth-unavailable" role="status">
                  <strong>Account service isn’t connected yet</strong>
                  <p>
                    Sign-in and account creation will become available once the
                    Shopilot administrator connects the account service. No
                    account or business has been created on this device.
                  </p>
                </div>
              )}
              {(view === "login" || view === "signup") && (
                <>
                  <form onSubmit={authenticate} autoComplete="on">
                    {view === "signup" && (
                      <label>
                        Your name
                        <input
                          required
                          id="owner-name"
                          name="ownerName"
                          autoComplete="name"
                          maxLength={100}
                          value={ownerName}
                          onChange={(e) => setOwnerName(e.target.value)}
                          placeholder="How should we address you?"
                        />
                      </label>
                    )}
                    <label>
                      Email address
                      <input
                        required
                        id="account-email"
                        name="email"
                        type="email"
                        autoComplete="username"
                        inputMode="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@yourbusiness.com"
                      />
                    </label>
                    <PasswordField
                      key={view}
                      value={password}
                      onChange={setPassword}
                      creating={view === "signup"}
                    />
                    {view === "login" && (
                      <button
                        className="text-button forgot"
                        type="button"
                        disabled={!client || busy}
                        onClick={resetPassword}
                      >
                        Forgot password?
                      </button>
                    )}
                    <button
                      className="button primary full"
                      disabled={!client || busy}
                    >
                      {busy
                        ? "Please wait…"
                        : view === "signup"
                          ? "Create account"
                          : "Sign in"}
                      <ArrowRight size={17} />
                    </button>
                  </form>
                  <div className="auth-switch">
                    {view === "signup"
                      ? "Already have an account?"
                      : "New to Shopilot?"}{" "}
                    <button
                      onClick={() => {
                        setView(view === "signup" ? "login" : "signup");
                        setMessage("");
                        setPassword("");
                      }}
                    >
                      {view === "signup" ? "Sign in" : "Create an account"}
                    </button>
                  </div>
                </>
              )}
              {view === "setup" && (
                <form onSubmit={setup} autoComplete="on">
                  <label>
                    Business name
                    <input
                      required
                      id="business-name"
                      name="businessName"
                      autoComplete="organization"
                      maxLength={120}
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g. Amina’s General Store"
                    />
                  </label>
                  <label>
                    Business type
                    <select
                      id="business-type"
                      name="businessType"
                      value={businessType}
                      onChange={(e) => setBusinessType(e.target.value)}
                    >
                      <option>Retail shop</option>
                      <option>Wholesaler</option>
                      <option>Retail & wholesale</option>
                      <option>Other small business</option>
                    </select>
                  </label>
                  <label>
                    Business phone <span className="muted">(optional)</span>
                    <input
                      type="tel"
                      id="business-phone"
                      name="phone"
                      autoComplete="tel"
                      maxLength={40}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 0801 234 5678"
                    />
                  </label>
                  <label>
                    Business address <span className="muted">(optional)</span>
                    <input
                      autoComplete="street-address"
                      id="business-address"
                      name="address"
                      maxLength={300}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Your shop or business address"
                    />
                  </label>
                  <div className="setup-summary">
                    <ShieldCheck size={20} />
                    <span>
                      Your records start at zero. Only your business’s records
                      appear in this workspace.
                    </span>
                  </div>
                  <button className="button primary full" disabled={busy}>
                    {busy ? "Creating your workspace…" : "Create my business"}
                    <ArrowRight size={17} />
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => exit().catch((e) => setMessage(e.message))}
                  >
                    Sign out
                  </button>
                </form>
              )}
              {view === "confirm" && (
                <button
                  className="button primary full"
                  onClick={() => {
                    setView("login");
                    setMessage("");
                  }}
                >
                  Back to sign in <ArrowRight size={17} />
                </button>
              )}
              {view === "recovery" && (
                <form onSubmit={updatePassword}>
                  <PasswordField
                    key="recovery"
                    id="recovery-password"
                    label="New password"
                    creating
                    value={password}
                    onChange={setPassword}
                  />
                  <button className="button primary full" disabled={busy}>
                    Update password
                  </button>
                </form>
              )}
              <div className="access-trust">
                <ShieldCheck size={14} /> Your business. Your private workspace.
              </div>
            </>
          )}
        </div>
        <div className="access-footer">Shopilot · Your business, in view.</div>
      </section>
    </main>
  );
}
