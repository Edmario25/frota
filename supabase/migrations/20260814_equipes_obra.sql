-- ══════════════════════════════════════════════════════════════════════════════
-- Equipes por Obra — controle de mão de obra
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Equipes da obra (times nomeados com encarregado responsável)
CREATE TABLE IF NOT EXISTS public.obra_equipes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id         uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  encarregado_id  uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  descricao       text,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 2. Membros de cada equipe
CREATE TABLE IF NOT EXISTS public.obra_equipe_membros (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id   uuid NOT NULL REFERENCES public.obra_equipes(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  funcao      text,
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (equipe_id, employee_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_obra_equipes_obra     ON public.obra_equipes(obra_id);
CREATE INDEX IF NOT EXISTS idx_equipe_membros_equipe ON public.obra_equipe_membros(equipe_id);
CREATE INDEX IF NOT EXISTS idx_equipe_membros_emp    ON public.obra_equipe_membros(employee_id);

-- RLS
ALTER TABLE public.obra_equipes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_equipe_membros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipes_all"        ON public.obra_equipes        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "equipe_membros_all" ON public.obra_equipe_membros FOR ALL TO authenticated USING (true) WITH CHECK (true);
