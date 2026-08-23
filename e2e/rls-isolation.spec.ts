import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const config = {
  url: process.env.E2E_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  anonKey:
    process.env.E2E_SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  email: process.env.E2E_GESTOR_OBRA_EMAIL,
  password: process.env.E2E_GESTOR_OBRA_PASSWORD,
  obraAId: process.env.E2E_OBRA_A_ID,
  obraBId: process.env.E2E_OBRA_B_ID,
};

const missingConfig = Object.entries(config)
  .filter(([, value]) => !value)
  .map(([key]) => key);

test.describe("isolamento RLS entre obras", () => {
  test.skip(
    missingConfig.length > 0,
    `Configure as variáveis do teste RLS: ${missingConfig.join(", ")}`,
  );

  let client: SupabaseClient;

  test.beforeAll(async () => {
    client = createClient(config.url!, config.anonKey!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { error } = await client.auth.signInWithPassword({
      email: config.email!,
      password: config.password!,
    });

    expect(error, "a conta sintética deve conseguir autenticar").toBeNull();
  });

  test.afterAll(async () => {
    await client?.auth.signOut();
  });

  test("a conta possui perfil gestor_obra", async () => {
    const { data, error } = await client.rpc("get_user_role");

    expect(error).toBeNull();
    expect(data).toBe("gestor_obra");
  });

  test("o vínculo contém a Obra A e não contém a Obra B", async () => {
    const { data, error } = await client.rpc("get_user_obra_ids");

    expect(error).toBeNull();
    expect(data).toContain(config.obraAId);
    expect(data).not.toContain(config.obraBId);
  });

  test("a consulta direta enxerga a Obra A e oculta a Obra B", async () => {
    const { data, error } = await client
      .from("obras")
      .select("id")
      .in("id", [config.obraAId!, config.obraBId!]);

    expect(error).toBeNull();
    expect(data?.map(({ id }) => id)).toEqual([config.obraAId]);
  });

  test("a função de autorização nega explicitamente a Obra B", async () => {
    const { data, error } = await client.rpc("can_access_obra_data", {
      target_obra_id: config.obraBId!,
    });

    expect(error).toBeNull();
    expect(data).toBe(false);
  });
});
