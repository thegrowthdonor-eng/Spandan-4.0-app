import { cookies } from "next/headers";
import { createAdminClient } from "@/server/supabase/admin";
import { requiredServerEnv } from "@/server/env";
import { SIGNUP_BROWSER_COOKIE, signupBrowser, signupBrowserHash } from "./signup-browser";

export async function rememberSignupBrowser(profileId: string) {
  const pepper = requiredServerEnv("AUTH_IDENTITY_PEPPER");
  const value = signupBrowser((await cookies()).get(SIGNUP_BROWSER_COOKIE)?.value, pepper);
  const { error } = await createAdminClient().rpc("remember_signup_browser", { p_hash: signupBrowserHash(value, pepper), p_profile: profileId });
  if (error) throw new Error("Could not record signup browser.");
  return value;
}
