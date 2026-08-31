import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler, UserClient } from "./handler.ts";
import { resolveSupabaseRuntimeKeys } from "./runtime_keys.ts";
import { RpcClient } from "./worker.ts";

const supabaseURL = Deno.env.get("SUPABASE_URL")?.trim();
const { adminKey, authKey } = resolveSupabaseRuntimeKeys({
  SUPABASE_SECRET_KEYS: Deno.env.get("SUPABASE_SECRET_KEYS"),
  SUPABASE_PUBLISHABLE_KEYS: Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  SUPABASE_SECRET_KEY: Deno.env.get("SUPABASE_SECRET_KEY"),
  SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
  SUPABASE_PUBLISHABLE_KEY: Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),
});

if (!supabaseURL || !adminKey || !authKey) {
  throw new Error("supabase_configuration_missing");
}

const createAdminClient = () =>
  createClient(supabaseURL, adminKey, {
    auth: { persistSession: false },
  }) as unknown as RpcClient;

const createUserClient = (authorization: string) =>
  createClient(supabaseURL, authKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  }) as unknown as UserClient;

Deno.serve(createHandler({
  adminKey,
  authKey,
  musicfetchToken: Deno.env.get("MUSICFETCH_API_TOKEN")?.trim() || null,
  createAdminClient,
  createUserClient,
}));
