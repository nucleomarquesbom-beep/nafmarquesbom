-- Optimize auth.uid() evaluation in frequently checked RLS policies.
-- Authorization predicates and allowed data access remain unchanged.
-- Applied to the connected Supabase project during the 2026-10-16 review.

DROP POLICY IF EXISTS acoes_admin_all ON public.acoes;
CREATE POLICY acoes_admin_all ON public.acoes
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.socios s
    WHERE s.user_id = (SELECT auth.uid())
      AND s.ativo = true AND s.is_admin = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.socios s
    WHERE s.user_id = (SELECT auth.uid())
      AND s.ativo = true AND s.is_admin = true
  ));

DROP POLICY IF EXISTS acoes_inscricoes_admin_all ON public.acoes_inscricoes;
CREATE POLICY acoes_inscricoes_admin_all ON public.acoes_inscricoes
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.socios s
    WHERE s.user_id = (SELECT auth.uid())
      AND s.ativo = true AND s.is_admin = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.socios s
    WHERE s.user_id = (SELECT auth.uid())
      AND s.ativo = true AND s.is_admin = true
  ));

DROP POLICY IF EXISTS acoes_inscricoes_own_insert ON public.acoes_inscricoes;
CREATE POLICY acoes_inscricoes_own_insert ON public.acoes_inscricoes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.socios s
      WHERE s.id = acoes_inscricoes.socio_id
        AND s.user_id = (SELECT auth.uid())
        AND s.ativo = true
    )
    AND EXISTS (
      SELECT 1 FROM public.acoes a
      WHERE a.id = acoes_inscricoes.acao_id
        AND a.ativa = true
        AND a.inscricoes_abertas = true
        AND (a.prazo_inscricao IS NULL OR a.prazo_inscricao >= now())
        AND (a.limite_inscricoes IS NULL OR (
          SELECT count(*) FROM public.acoes_inscricoes ai
          WHERE ai.acao_id = a.id AND ai.estado <> 'cancelada'
        ) < a.limite_inscricoes)
    )
  );

DROP POLICY IF EXISTS acoes_inscricoes_own_select ON public.acoes_inscricoes;
CREATE POLICY acoes_inscricoes_own_select ON public.acoes_inscricoes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.socios s
    WHERE s.id = acoes_inscricoes.socio_id
      AND s.user_id = (SELECT auth.uid())
      AND s.ativo = true
  ));

DROP POLICY IF EXISTS acoes_inscricoes_own_update ON public.acoes_inscricoes;
CREATE POLICY acoes_inscricoes_own_update ON public.acoes_inscricoes
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.socios s
    WHERE s.id = acoes_inscricoes.socio_id
      AND s.user_id = (SELECT auth.uid())
      AND s.ativo = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.socios s
    WHERE s.id = acoes_inscricoes.socio_id
      AND s.user_id = (SELECT auth.uid())
      AND s.ativo = true
  ));

DROP POLICY IF EXISTS quota_comprovativos_insert ON public.quota_comprovativos;
CREATE POLICY quota_comprovativos_insert ON public.quota_comprovativos
  FOR INSERT TO public
  WITH CHECK (
    socio_id = (
      SELECT s.id FROM public.socios s
      WHERE s.user_id = (SELECT auth.uid())
        AND s.ativo = true
    )
    AND estado = 'pendente'
    AND validated_at IS NULL
    AND validated_by IS NULL
    AND EXISTS (
      SELECT 1 FROM public.quotas q
      WHERE q.id = quota_comprovativos.quota_id
        AND q.socio_id = quota_comprovativos.socio_id
        AND COALESCE(q.pago, false) = false
        AND COALESCE(q.estado, 'pendente') <> ALL (ARRAY['pago','paga','isento','anulado'])
    )
  );
