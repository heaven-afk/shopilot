import { test } from "node:test";
import assert from "node:assert/strict";
import { passwordGuidance } from "../src/lib/password.ts";
test("password feedback updates from empty through weak to strong", () => {
  assert.equal(passwordGuidance("").score, 0);
  assert.equal(passwordGuidance("Cat1!").label, "Weak");
  assert.equal(passwordGuidance("Moon2!ab").label, "Fair");
  const result = passwordGuidance("Violet!9Pines");
  assert.equal(result.label, "Strong");
  assert.ok(result.checks.every((c) => c.met));
});
test("common or repeated passwords do not receive strong feedback", () => {
  for (const password of [
    "Password123!AAAA",
    "abcabcabcabcabcabc",
    "AAAAAAAAAAAAAAAAAAA",
    "qwerty!12345Ab",
  ])
    assert.equal(passwordGuidance(password).label, "Weak");
});
test("long varied passphrases can receive strong feedback without composition rules", () => {
  assert.equal(
    passwordGuidance("violet rivers carry copper leaves").label,
    "Strong",
  );
  assert.equal(
    passwordGuidance("violet rivers carry copper leaves").checks.find(
      (c) => c.label === "Number",
    )?.met,
    false,
  );
});
