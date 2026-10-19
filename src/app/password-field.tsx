"use client";
import { useState } from "react";
import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { passwordGuidance } from "../lib/password";

export default function PasswordField({
  value,
  onChange,
  creating = false,
  label = "Password",
  id = "account-password",
}: {
  value: string;
  onChange: (value: string) => void;
  creating?: boolean;
  label?: string;
  id?: string;
}) {
  const [visible, setVisible] = useState(false);
  const guidance = passwordGuidance(value);
  const update = (event: React.SyntheticEvent<HTMLInputElement>) =>
    onChange(event.currentTarget.value);
  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input-wrap">
        <input
          id={id}
          name="password"
          required
          type={visible ? "text" : "password"}
          autoComplete={creating ? "new-password" : "current-password"}
          minLength={creating ? 8 : 1}
          value={value}
          onChange={update}
          onInput={update}
          onFocus={update}
          onAnimationStart={(event) => {
            if (event.animationName === "shopilot-autofill") update(event);
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={
            creating ? `${id}-guidance ${id}-strength` : undefined
          }
          placeholder={
            creating ? "Create a unique password" : "Enter your password"
          }
        />
        <button
          className="password-toggle"
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-controls={id}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </div>
      {creating && (
        <div className="password-guidance" id={`${id}-guidance`}>
          <p className="password-minimum">
            At least 8 characters required. Aim for 12 or more.
          </p>
          <div className="password-strength-heading">
            <span>Password strength</span>
            <strong id={`${id}-strength`} aria-live="polite" aria-atomic="true">
              {guidance.label}
            </strong>
          </div>
          <div
            className={`password-meter strength-${guidance.score}`}
            role="meter"
            aria-label="Estimated password strength"
            aria-valuemin={0}
            aria-valuemax={4}
            aria-valuenow={guidance.score}
            aria-valuetext={guidance.label}
          >
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className={n <= guidance.score ? "filled" : ""} />
            ))}
          </div>
          <p className="password-hint">For a stronger password, try:</p>
          <ul className="password-checklist">
            {guidance.checks.map((check) => (
              <li key={check.label} className={check.met ? "met" : ""}>
                {check.met ? <Check size={13} /> : <Circle size={11} />}
                <span>{check.label}</span>
                <span className="sr-only">
                  {check.met ? " — included" : " — not yet included"}
                </span>
              </li>
            ))}
          </ul>
          <p className="password-hint">{guidance.hint}</p>
        </div>
      )}
    </div>
  );
}
