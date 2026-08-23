import { createClient } from "@supabase/supabase-js"

// ─── Credenciais Ápice Gestão ─────────────────────────────────────────────────
const SUPABASE_URL = "https://dadosfrota.apicesystem.shop"

// Somente a chave pública pode ser incorporada ao APK.
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3OTEyNTUyMCwiZXhwIjo0OTM0Nzk5MTIwLCJyb2xlIjoiYW5vbiJ9.IqWNK7emQs5KOqcKqMVaDx2V_NtE6RKYKGjAXvCUqcE"

export const supabase = createClient(
  SUPABASE_URL,
  ANON_KEY,
  {
    auth: {
      persistSession: false,   // totem não precisa de sessão de usuário
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
)
