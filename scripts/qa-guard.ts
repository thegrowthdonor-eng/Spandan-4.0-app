import { createClient } from "@supabase/supabase-js";

export const QA_PROJECT_REF = "rgcevrvxfunmwephhomy";
export const QA_CONFIRMATION = "SPANDAN_VISUAL_QA";

export function requireQaEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.QA_PROJECT_REF !== QA_PROJECT_REF || process.env.QA_ALLOW_SEED !== QA_CONFIRMATION) {
    throw new Error("Refusing: set QA_PROJECT_REF and QA_ALLOW_SEED for the isolated visual-QA project.");
  }
  if (!url?.includes(QA_PROJECT_REF) || !serviceKey) {
    throw new Error("Refusing: QA URL or service-role key is missing or points at a non-QA project.");
  }
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function requireQaPublicEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (process.env.QA_PROJECT_REF !== QA_PROJECT_REF || !url?.includes(QA_PROJECT_REF) || !key) {
    throw new Error("Refusing: public QA configuration does not point to the isolated visual-QA project.");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function failIfError(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}`);
}
