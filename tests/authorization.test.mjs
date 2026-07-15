import assert from "node:assert/strict";
import test from "node:test";

import {
  canManageMembers,
  canManagePayment,
  normalizeEmail,
} from "../lib/authorization.ts";

test("members can manage only their own payments", () => {
  assert.equal(
    canManagePayment(
      { role: "member", userId: "user-1" },
      { createdBy: "user-1" },
    ),
    true,
  );
  assert.equal(
    canManagePayment(
      { role: "member", userId: "user-1" },
      { createdBy: "user-2" },
    ),
    false,
  );
});

test("owners can manage every project payment and membership", () => {
  assert.equal(
    canManagePayment(
      { role: "owner", userId: "owner" },
      { createdBy: "user-2" },
    ),
    true,
  );
  assert.equal(canManageMembers({ role: "owner", userId: "owner" }), true);
  assert.equal(canManageMembers({ role: "member", userId: "user-2" }), false);
});

test("email matching is case-insensitive and whitespace-safe", () => {
  assert.equal(normalizeEmail("  Alex@Example.COM "), "alex@example.com");
  assert.throws(() => normalizeEmail("not-an-email"), /valid email/);
});
