/*
====================================================================
 NÚCLEO MARQUES BOM
 SUPABASE — DRº ÁRBITRO (FUTEBOL + FUTSAL)

 MIGRAÇÃO SEGURA:
 - NÃO apaga tabelas existentes.
 - NÃO altera as tabelas atuais de Sócios/Fun&Learn.
 - começa com RESET ROLE para executar como postgres no SQL Editor
   quando a sessão tiver sido mudada para authenticated.
 - cria a estrutura completa do Drº Árbitro.
 - cria os dois formatos: Futebol e Futsal.
 - mantém os PDFs privados.
====================================================================
*/

BEGIN;

-- O teu SQL principal já usa esta técnica e é a correta para este caso.
RESET ROLE;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ================================================================
-- 1. MODALIDADES
-- ================================================================

CREATE TABLE IF NOT EXISTS public.dr_arbitro_modalidades (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo text NOT NULL UNIQUE
        CHECK (codigo IN ('futebol', 'futsal')),
    nome text NOT NULL,
    ativo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.dr_arbitro_modalidades (codigo, nome, ativo)
VALUES
    ('futebol', 'Drº Árbitro - Futebol', true),
    ('futsal',  'Drº Árbitro - Futsal',  true)
ON CONFLICT (codigo) DO UPDATE
SET nome = EXCLUDED.nome;

-- ================================================================
-- 2. EDIÇÕES
-- Cada ativação do Drº Árbitro é uma edição.
-- O administrador define quantos testes existirão nessa edição.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.dr_arbitro_edicoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    modalidade_id uuid NOT NULL
        REFERENCES public.dr_arbitro_modalidades(id) ON DELETE CASCADE,
    nome text NOT NULL,
    ativo boolean NOT NULL DEFAULT false,
    numero_testes integer NOT NULL CHECK (numero_testes > 0),
    inscricoes_abertas boolean NOT NULL DEFAULT true,
    criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dr_arbitro_edicoes
    ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.dr_arbitro_edicoes
    ADD COLUMN IF NOT EXISTS modalidade_id uuid;
ALTER TABLE public.dr_arbitro_edicoes
    ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.dr_arbitro_edicoes
    ADD COLUMN IF NOT EXISTS ativo boolean;
ALTER TABLE public.dr_arbitro_edicoes
    ADD COLUMN IF NOT EXISTS numero_testes integer;
ALTER TABLE public.dr_arbitro_edicoes
    ADD COLUMN IF NOT EXISTS inscricoes_abertas boolean;
ALTER TABLE public.dr_arbitro_edicoes
    ADD COLUMN IF NOT EXISTS criado_por uuid;
ALTER TABLE public.dr_arbitro_edicoes
    ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.dr_arbitro_edicoes
    ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.dr_arbitro_edicoes
SET ativo = false WHERE ativo IS NULL;
UPDATE public.dr_arbitro_edicoes
SET inscricoes_abertas = true WHERE inscricoes_abertas IS NULL;
UPDATE public.dr_arbitro_edicoes
SET numero_testes = 1 WHERE numero_testes IS NULL;
UPDATE public.dr_arbitro_edicoes
SET created_at = now() WHERE created_at IS NULL;
UPDATE public.dr_arbitro_edicoes
SET updated_at = now() WHERE updated_at IS NULL;

ALTER TABLE public.dr_arbitro_edicoes
    ALTER COLUMN ativo SET DEFAULT false,
    ALTER COLUMN ativo SET NOT NULL,
    ALTER COLUMN inscricoes_abertas SET DEFAULT true,
    ALTER COLUMN inscricoes_abertas SET NOT NULL,
    ALTER COLUMN numero_testes SET NOT NULL,
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET DEFAULT now(),
    ALTER COLUMN updated_at SET NOT NULL;

-- ================================================================
-- 3. TESTES
-- Cada teste tem uma janela própria de acesso.
-- O PDF é guardado no bucket privado dr-arbitro.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.dr_arbitro_testes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    edicao_id uuid NOT NULL
        REFERENCES public.dr_arbitro_edicoes(id) ON DELETE CASCADE,
    numero_teste integer NOT NULL CHECK (numero_teste > 0),
    titulo text NOT NULL,
    ficheiro_path text,
    inicio_em timestamptz NOT NULL,
    fim_em timestamptz NOT NULL,
    ativo boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT dr_arbitro_testes_periodo_check
        CHECK (fim_em > inicio_em),

    CONSTRAINT dr_arbitro_testes_numero_unique
        UNIQUE (edicao_id, numero_teste)
);

-- ================================================================
-- 4. PERGUNTAS
-- O PDF contém pergunta + 4 opções + resposta correta.
-- A resposta correta NÃO fica exposta aos sócios através da API.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.dr_arbitro_perguntas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    teste_id uuid NOT NULL
        REFERENCES public.dr_arbitro_testes(id) ON DELETE CASCADE,
    numero integer NOT NULL CHECK (numero > 0),
    pergunta text NOT NULL,
    opcao_a text NOT NULL,
    opcao_b text NOT NULL,
    opcao_c text NOT NULL,
    opcao_d text NOT NULL,
    resposta_correta char(1) NOT NULL
        CHECK (resposta_correta IN ('A', 'B', 'C', 'D')),
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT dr_arbitro_perguntas_numero_unique
        UNIQUE (teste_id, numero)
);

-- ================================================================
-- 5. INSCRIÇÕES
-- Um sócio só pode inscrever-se uma vez em cada edição.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.dr_arbitro_inscricoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    edicao_id uuid NOT NULL
        REFERENCES public.dr_arbitro_edicoes(id) ON DELETE CASCADE,
    socio_id uuid NOT NULL
        REFERENCES public.socios(id) ON DELETE CASCADE,
    inscrito_em timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT dr_arbitro_inscricoes_unique
        UNIQUE (edicao_id, socio_id)
);

-- ================================================================
-- 6. TENTATIVAS
--
-- IMPORTANTE:
-- Assim que o sócio entra no teste, nasce uma tentativa.
-- Se sair/recarregar/fechar a página, não pode criar outra.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.dr_arbitro_tentativas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    teste_id uuid NOT NULL
        REFERENCES public.dr_arbitro_testes(id) ON DELETE CASCADE,
    socio_id uuid NOT NULL
        REFERENCES public.socios(id) ON DELETE CASCADE,
    inscricao_id uuid NOT NULL
        REFERENCES public.dr_arbitro_inscricoes(id) ON DELETE CASCADE,
    iniciou_em timestamptz NOT NULL DEFAULT now(),
    submeteu_em timestamptz,
    nota integer
        CHECK (nota IS NULL OR nota >= 0),
    total_perguntas integer
        CHECK (total_perguntas IS NULL OR total_perguntas >= 0),
    percentagem numeric(5,2)
        CHECK (
            percentagem IS NULL
            OR (percentagem >= 0 AND percentagem <= 100)
        ),

    CONSTRAINT dr_arbitro_tentativas_unique
        UNIQUE (teste_id, socio_id)
);

-- ================================================================
-- 7. RESPOSTAS
-- A resposta correta é calculada no servidor.
-- O sócio não pode inserir/alterar diretamente esta tabela.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.dr_arbitro_respostas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tentativa_id uuid NOT NULL
        REFERENCES public.dr_arbitro_tentativas(id) ON DELETE CASCADE,
    pergunta_id uuid NOT NULL
        REFERENCES public.dr_arbitro_perguntas(id) ON DELETE CASCADE,
    resposta char(1) NOT NULL
        CHECK (resposta IN ('A', 'B', 'C', 'D')),
    correta boolean NOT NULL DEFAULT false,
    respondida_em timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT dr_arbitro_respostas_unique
        UNIQUE (tentativa_id, pergunta_id)
);

-- ================================================================
-- 8. ÍNDICES
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_dr_arbitro_edicoes_modalidade
    ON public.dr_arbitro_edicoes(modalidade_id);

CREATE INDEX IF NOT EXISTS idx_dr_arbitro_testes_edicao
    ON public.dr_arbitro_testes(edicao_id);

CREATE INDEX IF NOT EXISTS idx_dr_arbitro_perguntas_teste
    ON public.dr_arbitro_perguntas(teste_id);

CREATE INDEX IF NOT EXISTS idx_dr_arbitro_inscricoes_edicao
    ON public.dr_arbitro_inscricoes(edicao_id);

CREATE INDEX IF NOT EXISTS idx_dr_arbitro_inscricoes_socio
    ON public.dr_arbitro_inscricoes(socio_id);

CREATE INDEX IF NOT EXISTS idx_dr_arbitro_tentativas_teste
    ON public.dr_arbitro_tentativas(teste_id);

CREATE INDEX IF NOT EXISTS idx_dr_arbitro_tentativas_socio
    ON public.dr_arbitro_tentativas(socio_id);

CREATE INDEX IF NOT EXISTS idx_dr_arbitro_respostas_tentativa
    ON public.dr_arbitro_respostas(tentativa_id);

-- ================================================================
-- 9. updated_at
-- ================================================================

CREATE OR REPLACE FUNCTION public.dr_arbitro_atualizar_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.dr_arbitro_atualizar_updated_at() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_dr_arbitro_edicoes_updated_at
ON public.dr_arbitro_edicoes;

CREATE TRIGGER trg_dr_arbitro_edicoes_updated_at
BEFORE UPDATE ON public.dr_arbitro_edicoes
FOR EACH ROW
EXECUTE FUNCTION public.dr_arbitro_atualizar_updated_at();

DROP TRIGGER IF EXISTS trg_dr_arbitro_testes_updated_at
ON public.dr_arbitro_testes;

CREATE TRIGGER trg_dr_arbitro_testes_updated_at
BEFORE UPDATE ON public.dr_arbitro_testes
FOR EACH ROW
EXECUTE FUNCTION public.dr_arbitro_atualizar_updated_at();

-- ================================================================
-- 10. INSCRIÇÃO DO SÓCIO
-- ================================================================

CREATE OR REPLACE FUNCTION public.dr_arbitro_inscrever(
    p_edicao_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_socio_id uuid;
    v_id uuid;
    v_ativo boolean;
    v_inscricoes_abertas boolean;
BEGIN
    SELECT s.id
    INTO v_socio_id
    FROM public.socios s
    WHERE s.user_id = auth.uid()
      AND s.ativo = true
    LIMIT 1;

    IF v_socio_id IS NULL THEN
        RAISE EXCEPTION 'Apenas sócios ativos podem inscrever-se';
    END IF;

    SELECT e.ativo, e.inscricoes_abertas
    INTO v_ativo, v_inscricoes_abertas
    FROM public.dr_arbitro_edicoes e
    WHERE e.id = p_edicao_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Edição Drº Árbitro não encontrada';
    END IF;

    IF NOT v_ativo OR NOT v_inscricoes_abertas THEN
        RAISE EXCEPTION 'As inscrições estão encerradas';
    END IF;

    INSERT INTO public.dr_arbitro_inscricoes (
        edicao_id,
        socio_id
    )
    VALUES (
        p_edicao_id,
        v_socio_id
    )
    ON CONFLICT (edicao_id, socio_id)
    DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
        SELECT i.id
        INTO v_id
        FROM public.dr_arbitro_inscricoes i
        WHERE i.edicao_id = p_edicao_id
          AND i.socio_id = v_socio_id;
    END IF;

    RETURN v_id;
END;
$$;

ALTER FUNCTION public.dr_arbitro_inscrever(uuid) OWNER TO postgres;

-- ================================================================
-- 11. INICIAR TESTE
--
-- Regra principal:
-- a partir do momento em que existe tentativa, não é possível
-- criar uma segunda tentativa para o mesmo teste.
-- ================================================================

CREATE OR REPLACE FUNCTION public.dr_arbitro_iniciar_teste(
    p_teste_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_socio_id uuid;
    v_edicao_id uuid;
    v_inscricao_id uuid;
    v_ativo boolean;
    v_inicio timestamptz;
    v_fim timestamptz;
    v_id uuid;
    v_total integer;
BEGIN
    SELECT s.id
    INTO v_socio_id
    FROM public.socios s
    WHERE s.user_id = auth.uid()
      AND s.ativo = true
    LIMIT 1;

    IF v_socio_id IS NULL THEN
        RAISE EXCEPTION 'Apenas sócios ativos podem realizar o teste';
    END IF;

    SELECT
        t.edicao_id,
        t.ativo,
        t.inicio_em,
        t.fim_em
    INTO
        v_edicao_id,
        v_ativo,
        v_inicio,
        v_fim
    FROM public.dr_arbitro_testes t
    WHERE t.id = p_teste_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Teste não encontrado';
    END IF;

    IF NOT v_ativo THEN
        RAISE EXCEPTION 'Este teste ainda não está ativo';
    END IF;

    IF now() < v_inicio THEN
        RAISE EXCEPTION 'Este teste ainda não começou';
    END IF;

    IF now() > v_fim THEN
        RAISE EXCEPTION 'O período deste teste terminou';
    END IF;

    SELECT i.id
    INTO v_inscricao_id
    FROM public.dr_arbitro_inscricoes i
    JOIN public.dr_arbitro_edicoes e
      ON e.id = i.edicao_id
    WHERE i.edicao_id = v_edicao_id
      AND i.socio_id = v_socio_id
      AND e.ativo = true;

    IF v_inscricao_id IS NULL THEN
        RAISE EXCEPTION 'O sócio não está inscrito nesta edição';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.dr_arbitro_tentativas
        WHERE teste_id = p_teste_id
          AND socio_id = v_socio_id
    ) THEN
        RAISE EXCEPTION
            'Este teste já foi iniciado. Não é possível voltar a entrar.';
    END IF;

    SELECT count(*)
    INTO v_total
    FROM public.dr_arbitro_perguntas
    WHERE teste_id = p_teste_id;

    IF v_total = 0 THEN
        RAISE EXCEPTION 'Este teste ainda não tem perguntas';
    END IF;

    INSERT INTO public.dr_arbitro_tentativas (
        teste_id,
        socio_id,
        inscricao_id,
        total_perguntas
    )
    VALUES (
        p_teste_id,
        v_socio_id,
        v_inscricao_id,
        v_total
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

ALTER FUNCTION public.dr_arbitro_iniciar_teste(uuid) OWNER TO postgres;

-- ================================================================
-- 12. SUBMETER TESTE
--
-- Recebe:
-- [
--   {"pergunta_id":"UUID","resposta":"A"},
--   {"pergunta_id":"UUID","resposta":"C"}
-- ]
--
-- A nota é calculada no servidor.
-- ================================================================

CREATE OR REPLACE FUNCTION public.dr_arbitro_submeter_teste(
    p_tentativa_id uuid,
    p_respostas jsonb
)
RETURNS TABLE (
    nota integer,
    total_perguntas integer,
    percentagem numeric(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_socio_id uuid;
    v_teste_id uuid;
    v_fim timestamptz;
    v_total integer;
    v_corretas integer;
BEGIN
    SELECT
        t.socio_id,
        t.teste_id,
        tt.fim_em
    INTO
        v_socio_id,
        v_teste_id,
        v_fim
    FROM public.dr_arbitro_tentativas t
    JOIN public.dr_arbitro_testes tt
      ON tt.id = t.teste_id
    WHERE t.id = p_tentativa_id
      AND t.submeteu_em IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Tentativa inexistente ou já submetida';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.socios s
        WHERE s.id = v_socio_id
          AND s.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Esta tentativa não pertence ao utilizador';
    END IF;

    IF now() > v_fim THEN
        RAISE EXCEPTION
            'O período deste teste terminou. A tentativa não pode ser submetida.';
    END IF;

    DELETE FROM public.dr_arbitro_respostas
    WHERE tentativa_id = p_tentativa_id;

    INSERT INTO public.dr_arbitro_respostas (
        tentativa_id,
        pergunta_id,
        resposta,
        correta
    )
    SELECT
        p_tentativa_id,
        p.id,
        x.resposta,
        (p.resposta_correta = x.resposta)
    FROM jsonb_to_recordset(
        COALESCE(p_respostas, '[]'::jsonb)
    ) AS x(
        pergunta_id uuid,
        resposta char(1)
    )
    JOIN public.dr_arbitro_perguntas p
      ON p.id = x.pergunta_id
     AND p.teste_id = v_teste_id
    WHERE x.resposta IN ('A','B','C','D');

    SELECT count(*)
    INTO v_total
    FROM public.dr_arbitro_perguntas
    WHERE teste_id = v_teste_id;

    SELECT count(*)
    INTO v_corretas
    FROM public.dr_arbitro_respostas
    WHERE tentativa_id = p_tentativa_id
      AND correta = true;

    UPDATE public.dr_arbitro_tentativas
    SET
        submeteu_em = now(),
        nota = v_corretas,
        total_perguntas = v_total,
        percentagem =
            CASE
                WHEN v_total = 0 THEN 0
                ELSE round(
                    (v_corretas::numeric / v_total::numeric) * 100,
                    2
                )
            END
    WHERE id = p_tentativa_id;

    RETURN QUERY
    SELECT
        v_corretas,
        v_total,
        CASE
            WHEN v_total = 0 THEN 0::numeric(5,2)
            ELSE round(
                (v_corretas::numeric / v_total::numeric) * 100,
                2
            )::numeric(5,2)
        END;
END;
$$;

ALTER FUNCTION public.dr_arbitro_submeter_teste(uuid, jsonb)
    OWNER TO postgres;

-- ================================================================
-- 13. RESULTADO DO SÓCIO
--
-- Só fica disponível depois do fim do teste.
-- Devolve nota + média + respostas + resposta correta.
-- ================================================================

CREATE OR REPLACE FUNCTION public.dr_arbitro_resultado_teste(
    p_teste_id uuid
)
RETURNS TABLE (
    pergunta_numero integer,
    pergunta text,
    opcao_a text,
    opcao_b text,
    opcao_c text,
    opcao_d text,
    resposta_dada char(1),
    resposta_correta char(1),
    correta boolean,
    nota integer,
    total_perguntas integer,
    percentagem numeric(5,2),
    media_teste numeric(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_socio_id uuid;
    v_fim timestamptz;
    v_tentativa_id uuid;
    v_nota integer;
    v_total integer;
    v_percentagem numeric(5,2);
    v_media numeric(5,2);
BEGIN
    SELECT s.id
    INTO v_socio_id
    FROM public.socios s
    WHERE s.user_id = auth.uid()
      AND s.ativo = true
    LIMIT 1;

    IF v_socio_id IS NULL THEN
        RAISE EXCEPTION 'Sócio não encontrado';
    END IF;

    SELECT t.fim_em
    INTO v_fim
    FROM public.dr_arbitro_testes t
    WHERE t.id = p_teste_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Teste não encontrado';
    END IF;

    IF now() < v_fim THEN
        RAISE EXCEPTION
            'O resultado e as respostas corretas só ficam disponíveis quando o teste terminar';
    END IF;

    SELECT
        t.id,
        t.nota,
        t.total_perguntas,
        t.percentagem
    INTO
        v_tentativa_id,
        v_nota,
        v_total,
        v_percentagem
    FROM public.dr_arbitro_tentativas t
    WHERE t.teste_id = p_teste_id
      AND t.socio_id = v_socio_id
      AND t.submeteu_em IS NOT NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Não existe uma resposta submetida para este teste';
    END IF;

    SELECT round(avg(t.percentagem), 2)
    INTO v_media
    FROM public.dr_arbitro_tentativas t
    WHERE t.teste_id = p_teste_id
      AND t.submeteu_em IS NOT NULL;

    RETURN QUERY
    SELECT
        p.numero,
        p.pergunta,
        p.opcao_a,
        p.opcao_b,
        p.opcao_c,
        p.opcao_d,
        r.resposta,
        p.resposta_correta,
        r.correta,
        v_nota,
        v_total,
        v_percentagem,
        v_media
    FROM public.dr_arbitro_perguntas p
    LEFT JOIN public.dr_arbitro_respostas r
      ON r.pergunta_id = p.id
     AND r.tentativa_id = v_tentativa_id
    WHERE p.teste_id = p_teste_id
    ORDER BY p.numero;
END;
$$;

ALTER FUNCTION public.dr_arbitro_resultado_teste(uuid)
    OWNER TO postgres;

-- ================================================================
-- 14. VISTA PÚBLICA DAS PERGUNTAS
--
-- Não inclui resposta_correta.
-- Serve para o sócio responder ao teste.
-- ================================================================

DROP VIEW IF EXISTS public.dr_arbitro_perguntas_publicas;

CREATE VIEW public.dr_arbitro_perguntas_publicas
WITH (security_invoker = true)
AS
SELECT
    p.id,
    p.teste_id,
    p.numero,
    p.pergunta,
    p.opcao_a,
    p.opcao_b,
    p.opcao_c,
    p.opcao_d
FROM public.dr_arbitro_perguntas p;

-- ================================================================
-- 15. VISTA DE RESUMO DO SÓCIO
-- Só mostra resultados que já foram submetidos.
-- ================================================================

DROP VIEW IF EXISTS public.dr_arbitro_meus_resultados;

CREATE VIEW public.dr_arbitro_meus_resultados
WITH (security_invoker = true)
AS
SELECT
    t.id AS tentativa_id,
    t.teste_id,
    t.socio_id,
    t.iniciou_em,
    t.submeteu_em,
    t.nota,
    t.total_perguntas,
    t.percentagem,
    round(avg(t2.percentagem), 2)::numeric(5,2) AS media_teste
FROM public.dr_arbitro_tentativas t
JOIN public.dr_arbitro_testes dt
  ON dt.id = t.teste_id
LEFT JOIN public.dr_arbitro_tentativas t2
  ON t2.teste_id = t.teste_id
 AND t2.submeteu_em IS NOT NULL
WHERE t.submeteu_em IS NOT NULL
  AND now() >= dt.fim_em
GROUP BY
    t.id,
    t.teste_id,
    t.socio_id,
    t.iniciou_em,
    t.submeteu_em,
    t.nota,
    t.total_perguntas,
    t.percentagem;

-- ================================================================
-- 16. RLS
-- ================================================================

ALTER TABLE public.dr_arbitro_modalidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dr_arbitro_edicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dr_arbitro_testes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dr_arbitro_perguntas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dr_arbitro_inscricoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dr_arbitro_tentativas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dr_arbitro_respostas ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- 17. POLICIES — MODALIDADES
-- ================================================================

DROP POLICY IF EXISTS "dr_arbitro_modalidades_select_auth"
ON public.dr_arbitro_modalidades;

DROP POLICY IF EXISTS "dr_arbitro_modalidades_admin_update"
ON public.dr_arbitro_modalidades;

CREATE POLICY "dr_arbitro_modalidades_select_auth"
ON public.dr_arbitro_modalidades
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "dr_arbitro_modalidades_admin_update"
ON public.dr_arbitro_modalidades
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ================================================================
-- 18. POLICIES — EDIÇÕES
-- ================================================================

DROP POLICY IF EXISTS "dr_arbitro_edicoes_select_auth"
ON public.dr_arbitro_edicoes;

DROP POLICY IF EXISTS "dr_arbitro_edicoes_admin_all"
ON public.dr_arbitro_edicoes;

CREATE POLICY "dr_arbitro_edicoes_select_auth"
ON public.dr_arbitro_edicoes
FOR SELECT
TO authenticated
USING (
    ativo = true
    OR public.is_admin()
);

CREATE POLICY "dr_arbitro_edicoes_admin_all"
ON public.dr_arbitro_edicoes
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ================================================================
-- 19. POLICIES — TESTES
-- O sócio só vê testes ativos dentro da janela temporal.
-- O admin vê tudo.
-- ================================================================

DROP POLICY IF EXISTS "dr_arbitro_testes_select_auth"
ON public.dr_arbitro_testes;

DROP POLICY IF EXISTS "dr_arbitro_testes_admin_all"
ON public.dr_arbitro_testes;

CREATE POLICY "dr_arbitro_testes_select_auth"
ON public.dr_arbitro_testes
FOR SELECT
TO authenticated
USING (
    public.is_admin()
    OR (
        ativo = true
        AND now() >= inicio_em
        AND now() <= fim_em
        AND EXISTS (
            SELECT 1
            FROM public.dr_arbitro_inscricoes i
            JOIN public.socios s
              ON s.id = i.socio_id
            WHERE i.edicao_id = dr_arbitro_testes.edicao_id
              AND s.user_id = (select auth.uid())
              AND s.ativo = true
        )
    )
);

CREATE POLICY "dr_arbitro_testes_admin_all"
ON public.dr_arbitro_testes
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ================================================================
-- 20. POLICIES — PERGUNTAS
-- Só o admin lê a tabela original.
-- Os sócios usam a VIEW sem resposta correta.
-- ================================================================

DROP POLICY IF EXISTS "dr_arbitro_perguntas_admin_all"
ON public.dr_arbitro_perguntas;

CREATE POLICY "dr_arbitro_perguntas_admin_all"
ON public.dr_arbitro_perguntas
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ================================================================
-- 21. POLICIES — INSCRIÇÕES
-- ================================================================

DROP POLICY IF EXISTS "dr_arbitro_inscricoes_select_auth"
ON public.dr_arbitro_inscricoes;

DROP POLICY IF EXISTS "dr_arbitro_inscricoes_admin_all"
ON public.dr_arbitro_inscricoes;

CREATE POLICY "dr_arbitro_inscricoes_select_auth"
ON public.dr_arbitro_inscricoes
FOR SELECT
TO authenticated
USING (
    public.is_admin()
    OR socio_id = (
        SELECT s.id
        FROM public.socios s
        WHERE s.user_id = (select auth.uid())
        LIMIT 1
    )
);

CREATE POLICY "dr_arbitro_inscricoes_admin_all"
ON public.dr_arbitro_inscricoes
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- A inscrição do sócio é feita exclusivamente pela função RPC.

-- ================================================================
-- 22. POLICIES — TENTATIVAS
-- ================================================================

DROP POLICY IF EXISTS "dr_arbitro_tentativas_select_auth"
ON public.dr_arbitro_tentativas;

DROP POLICY IF EXISTS "dr_arbitro_tentativas_admin_all"
ON public.dr_arbitro_tentativas;

CREATE POLICY "dr_arbitro_tentativas_select_auth"
ON public.dr_arbitro_tentativas
FOR SELECT
TO authenticated
USING (
    public.is_admin()
    OR socio_id = (
        SELECT s.id
        FROM public.socios s
        WHERE s.user_id = (select auth.uid())
        LIMIT 1
    )
);

CREATE POLICY "dr_arbitro_tentativas_admin_all"
ON public.dr_arbitro_tentativas
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ================================================================
-- 23. POLICIES — RESPOSTAS
--
-- O sócio só consegue ler respostas depois do fim do teste.
-- Assim não consegue descobrir a resposta correta durante o teste.
-- ================================================================

DROP POLICY IF EXISTS "dr_arbitro_respostas_select_auth"
ON public.dr_arbitro_respostas;

DROP POLICY IF EXISTS "dr_arbitro_respostas_admin_all"
ON public.dr_arbitro_respostas;

CREATE POLICY "dr_arbitro_respostas_select_auth"
ON public.dr_arbitro_respostas
FOR SELECT
TO authenticated
USING (
    public.is_admin()
    OR (
        EXISTS (
            SELECT 1
            FROM public.dr_arbitro_tentativas t
            JOIN public.dr_arbitro_testes dt
              ON dt.id = t.teste_id
            JOIN public.socios s
              ON s.id = t.socio_id
            WHERE t.id = dr_arbitro_respostas.tentativa_id
              AND s.user_id = (select auth.uid())
              AND t.submeteu_em IS NOT NULL
              AND now() >= dt.fim_em
        )
    )
);

CREATE POLICY "dr_arbitro_respostas_admin_all"
ON public.dr_arbitro_respostas
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- O sócio NÃO tem INSERT/UPDATE/DELETE direto nesta tabela.
-- A função SECURITY DEFINER faz isso.

-- ================================================================
-- 24. STORAGE — PDFS DO DRº ÁRBITRO
-- ================================================================

INSERT INTO storage.buckets (
    id,
    name,
    public
)
VALUES (
    'dr-arbitro',
    'dr-arbitro',
    false
)
ON CONFLICT (id) DO UPDATE
SET public = false;

DROP POLICY IF EXISTS "dr_arbitro_storage_admin_select"
ON storage.objects;

DROP POLICY IF EXISTS "dr_arbitro_storage_admin_insert"
ON storage.objects;

DROP POLICY IF EXISTS "dr_arbitro_storage_admin_update"
ON storage.objects;

DROP POLICY IF EXISTS "dr_arbitro_storage_admin_delete"
ON storage.objects;

CREATE POLICY "dr_arbitro_storage_admin_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'dr-arbitro'
    AND public.is_admin()
);

CREATE POLICY "dr_arbitro_storage_admin_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'dr-arbitro'
    AND public.is_admin()
);

CREATE POLICY "dr_arbitro_storage_admin_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'dr-arbitro'
    AND public.is_admin()
)
WITH CHECK (
    bucket_id = 'dr-arbitro'
    AND public.is_admin()
);

CREATE POLICY "dr_arbitro_storage_admin_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'dr-arbitro'
    AND public.is_admin()
);

-- ================================================================
-- 25. PERMISSÕES DA API
-- ================================================================

GRANT SELECT
ON public.dr_arbitro_modalidades,
   public.dr_arbitro_edicoes,
   public.dr_arbitro_testes,
   public.dr_arbitro_inscricoes,
   public.dr_arbitro_tentativas
TO authenticated;

GRANT SELECT
ON public.dr_arbitro_perguntas_publicas,
   public.dr_arbitro_meus_resultados
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.dr_arbitro_inscrever(uuid)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.dr_arbitro_iniciar_teste(uuid)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.dr_arbitro_submeter_teste(uuid, jsonb)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.dr_arbitro_resultado_teste(uuid)
TO authenticated;

-- ================================================================
-- 26. TESTES FINAIS
-- ================================================================

DO $$
DECLARE
    v_futebol integer;
    v_futsal integer;
BEGIN
    IF to_regclass('public.dr_arbitro_modalidades') IS NULL THEN
        RAISE EXCEPTION 'Falha: dr_arbitro_modalidades não existe';
    END IF;

    IF to_regclass('public.dr_arbitro_edicoes') IS NULL THEN
        RAISE EXCEPTION 'Falha: dr_arbitro_edicoes não existe';
    END IF;

    IF to_regclass('public.dr_arbitro_testes') IS NULL THEN
        RAISE EXCEPTION 'Falha: dr_arbitro_testes não existe';
    END IF;

    IF to_regclass('public.dr_arbitro_perguntas') IS NULL THEN
        RAISE EXCEPTION 'Falha: dr_arbitro_perguntas não existe';
    END IF;

    IF to_regclass('public.dr_arbitro_inscricoes') IS NULL THEN
        RAISE EXCEPTION 'Falha: dr_arbitro_inscricoes não existe';
    END IF;

    IF to_regclass('public.dr_arbitro_tentativas') IS NULL THEN
        RAISE EXCEPTION 'Falha: dr_arbitro_tentativas não existe';
    END IF;

    IF to_regclass('public.dr_arbitro_respostas') IS NULL THEN
        RAISE EXCEPTION 'Falha: dr_arbitro_respostas não existe';
    END IF;

    SELECT count(*)
    INTO v_futebol
    FROM public.dr_arbitro_modalidades
    WHERE codigo = 'futebol';

    SELECT count(*)
    INTO v_futsal
    FROM public.dr_arbitro_modalidades
    WHERE codigo = 'futsal';

    IF v_futebol <> 1 OR v_futsal <> 1 THEN
        RAISE EXCEPTION
            'Falha: Futebol/Futsal não foram configurados corretamente';
    END IF;
END
$$;

COMMIT;

/*
====================================================================
 RESULTADO

 Depois de executar este SQL:
   - existirão as modalidades Futebol e Futsal;
   - poderás criar uma edição para cada uma;
   - definir o número de testes;
   - abrir/fechar inscrições;
   - carregar um PDF por teste;
   - definir início e fim de cada teste;
   - criar as perguntas com 4 opções e resposta correta;
   - os sócios poderão inscrever-se;
   - ao iniciar um teste a tentativa fica bloqueada para reentrada;
   - a nota é calculada no servidor;
   - a média do teste fica disponível depois do fim;
   - as respostas corretas só ficam disponíveis depois do fim.

 IMPORTANTE:
 A parte de "ler automaticamente o PDF e transformar o conteúdo em
 perguntas" será tratada na implementação da função/admin.
 O SQL guarda o PDF e a estrutura das perguntas; não tenta interpretar
 um PDF arbitrário dentro do PostgreSQL.
====================================================================
*/

/* ================================================================
   27. COMPATIBILIDADE COM O CLIENTE ATUAL
   ================================================================ */

CREATE OR REPLACE FUNCTION public.dr_arbitro_finalizar_tentativa(
    p_tentativa_id uuid
)
RETURNS TABLE (
    nota integer,
    total_perguntas integer,
    percentagem numeric(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_socio_id uuid;
    v_teste_id uuid;
    v_fim timestamptz;
    v_total integer;
    v_corretas integer;
BEGIN
    SELECT t.socio_id, t.teste_id, tt.fim_em
    INTO v_socio_id, v_teste_id, v_fim
    FROM public.dr_arbitro_tentativas t
    JOIN public.dr_arbitro_testes tt ON tt.id = t.teste_id
    WHERE t.id = p_tentativa_id
      AND t.submeteu_em IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tentativa inexistente ou já submetida';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.socios s
        WHERE s.id = v_socio_id
          AND s.user_id = auth.uid()
          AND s.ativo = true
    ) THEN
        RAISE EXCEPTION 'Esta tentativa não pertence ao utilizador';
    END IF;

    IF now() < v_fim THEN
        RAISE EXCEPTION 'O teste ainda não terminou';
    END IF;

    SELECT count(*) INTO v_total
    FROM public.dr_arbitro_perguntas
    WHERE teste_id = v_teste_id;

    SELECT count(*) INTO v_corretas
    FROM public.dr_arbitro_respostas r
    JOIN public.dr_arbitro_perguntas p ON p.id = r.pergunta_id
    WHERE r.tentativa_id = p_tentativa_id
      AND r.correta = true;

    UPDATE public.dr_arbitro_tentativas
    SET submeteu_em = now(),
        nota = v_corretas,
        total_perguntas = v_total,
        percentagem = CASE
            WHEN v_total = 0 THEN 0::numeric(5,2)
            ELSE round((v_corretas::numeric / v_total::numeric) * 100, 2)::numeric(5,2)
        END
    WHERE id = p_tentativa_id;

    RETURN QUERY
    SELECT v_corretas,
           v_total,
           CASE
               WHEN v_total = 0 THEN 0::numeric(5,2)
               ELSE round((v_corretas::numeric / v_total::numeric) * 100, 2)::numeric(5,2)
           END;
END;
$$;

ALTER FUNCTION public.dr_arbitro_finalizar_tentativa(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.dr_arbitro_finalizar_tentativa(uuid) TO authenticated;
