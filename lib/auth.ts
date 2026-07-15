import { getChatGPTUser } from "@/app/chatgpt-auth";

export type IdentityUser = {
  email: string;
  displayName: string;
};

export class AuthenticationError extends Error {
  constructor() {
    super("Sign in required");
    this.name = "AuthenticationError";
  }
}

export async function getAppUser(): Promise<IdentityUser | null> {
  const platformUser = await getChatGPTUser();
  if (platformUser) {
    return {
      email: platformUser.email.trim().toLowerCase(),
      displayName: platformUser.displayName,
    };
  }

  if (process.env.NODE_ENV === "development") {
    return {
      email: "alex@harbor.local",
      displayName: "Alex Smith",
    };
  }

  return null;
}

export async function requireAppUser(): Promise<IdentityUser> {
  const user = await getAppUser();
  if (!user) throw new AuthenticationError();
  return user;
}
