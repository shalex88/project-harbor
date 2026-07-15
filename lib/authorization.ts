import { DomainError, type ProjectRole } from "./domain.ts";

export type ProjectActor = {
  userId: string;
  role: ProjectRole;
};

export function canManagePayment(
  actor: ProjectActor,
  payment: { createdBy: string },
): boolean {
  return actor.role === "owner" || actor.userId === payment.createdBy;
}

export function canManageMembers(actor: ProjectActor): boolean {
  return actor.role === "owner";
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new DomainError("enter a valid email address");
  }
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new DomainError("enter a valid email address");
  }
  return email;
}
