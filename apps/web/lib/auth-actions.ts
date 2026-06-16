"use server";

import { signOut } from "@/auth";

/** Sign the operator out and return to the sign-in page. */
export async function signOutAction() {
  await signOut({ redirectTo: "/signin" });
}
