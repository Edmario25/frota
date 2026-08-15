import { createClient } from "@supabase/supabase-js"

// ─── Credenciais Ápice Gestão ─────────────────────────────────────────────────
const SUPABASE_URL = "https://dadosfrota.apicesystem.shop"

// Service role key: bypassa RLS e auth — adequado para kiosk controlado pela empresa.
// Defina VITE_SERVICE_KEY no .env antes do build.
const SERVICE_KEY = import.meta.env.VITE_SERVICE_KEY ?? ""

// Fallback: anon key (usada apenas se service key não estiver configurada)
const ANON_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3OTEyNTUyMCwiZXhwIjo0OTM0Nzk5MTIwLCJyb2xlIjoiYW5vbiJ9.IqWNK7emQs5KOqcKqMVaDx2V_NtE6RKYKGjAXvCUqcE"

export const supabase = createClient(
  SUPABASE_URL,
  SERVICE_KEY || ANON_KEY,
  {
    auth: {
      persistSession: false,   // totem não precisa de sessão de usuário
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
)

export const TOTEM_PRONTO = !!SERVICE_KEY
