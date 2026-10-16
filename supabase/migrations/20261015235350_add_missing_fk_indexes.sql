-- Add indexes for foreign keys identified by the Supabase performance advisor.
-- Safe, additive change: no data is changed or removed.
CREATE INDEX IF NOT EXISTS idx_acoes_anulada_por
  ON public.acoes (anulada_por);

CREATE INDEX IF NOT EXISTS idx_questoes_socios_respondido_por
  ON public.questoes_socios (respondido_por);
