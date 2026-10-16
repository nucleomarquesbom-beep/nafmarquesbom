-- Keep the arbitration category optional and normalize legacy empty strings.
-- The existing CHECK constraints already permit NULL; blank form/import values should map to NULL.
UPDATE public.socios
SET categoria = NULL
WHERE categoria IS NOT NULL
  AND btrim(categoria) = '';
