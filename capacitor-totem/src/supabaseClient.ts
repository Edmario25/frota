import { createClient } from "@supabase/supabase-js"

// ─── Credenciais Ápice Gestão ─────────────────────────────────────────────────
// Mesmas do sistema principal — o totem usa a conta de serviço (totem@apicegestao.com)
// para autenticação, mas conecta ao mesmo projeto Supabase.
const SUPABASE_URL  = "https://dadosfrota.apicesystem.shop"
const SUPABASE_ANON = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3OTEyNTUyMCwiZXhwIjo0OTM0Nzk5MTIwLCJyb2xlIjoiYW5vbiJ9.IqWNK7emQs5KOqcKqMVaDx2V_NtE6RKYKGjAXvCUqcE"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

// ─── Credenciais da conta de serviço do totem ────────────────────────────────
// Crie este usuário no Supabase: Authentication → Users → Invite user
// E-mail: totem@apicegestao.com
// Senha:  (defina uma senha forte e coloque aqui)
// Permissões: apenas INSERT em employee_ponto_qr (via RLS)
export const TOTEM_EMAIL = import.meta.env.VITE_TOTEM_EMAIL ?? "totem@apicegestao.com"
export const TOTEM_SENHA = import.meta.env.VITE_TOTEM_SENHA ?? ""
