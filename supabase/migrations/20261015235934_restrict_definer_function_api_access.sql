-- Restrict API execution of privileged SECURITY DEFINER functions.
-- Admin RPCs retain authenticated execution and perform their own admin checks.
-- Trigger-only functions are not exposed as callable API functions.
REVOKE EXECUTE ON FUNCTION public.admin_arquivar_questao(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_importar_socios_excel(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_responder_questao(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.socio_criar_questao(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.email_outbox_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.questoes_socios_set_updated_at() FROM PUBLIC, anon, authenticated;

-- Intentionally left executable by anon/authenticated: this function returns only
-- the public-facing member directory fields (modality, category and name).
