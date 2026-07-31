-- =====================================================================
-- Configurações globais do sistema (logo, ícone, nome da empresa, etc.)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler
CREATE POLICY "system_settings_select_all"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (true);

-- Apenas gestor_contrato pode gravar
CREATE POLICY "system_settings_write_admin"
  ON public.system_settings FOR ALL
  TO authenticated
  USING (public.is_gestor_contrato())
  WITH CHECK (public.is_gestor_contrato());
