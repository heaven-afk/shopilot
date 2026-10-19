export function passwordGuidance(password: string) {
  const checks = [
    { label: "12 or more characters", met: password.length >= 12 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Lowercase letter", met: /[a-z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
    { label: "Symbol or space", met: /[^A-Za-z0-9]/.test(password) },
  ];
  const common = /password|qwerty|letmein|123456|abcdef|welcome|shopilot/i.test(
    password,
  );
  const repetitive =
    new Set(password.toLowerCase()).size < 5 || /(.{1,4})\1{2,}/.test(password);
  let score =
    password.length < 8
      ? 1
      : password.length < 12
        ? 2
        : checks.filter((c) => c.met).length >= 4
          ? 4
          : 3;
  if (password.length >= 20 && new Set(password.toLowerCase()).size >= 8)
    score = 4;
  if (common || repetitive) score = 1;
  if (!password) score = 0;
  const label = ["Not entered", "Weak", "Fair", "Good", "Strong"][score];
  return {
    score,
    label,
    checks,
    hint:
      password && (common || repetitive)
        ? "Avoid common passwords, predictable sequences, and repeated patterns."
        : "Use a unique password. A long passphrase is a good option too.",
  };
}
