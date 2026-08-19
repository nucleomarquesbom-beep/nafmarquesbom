-- Importação administrativa de sócios por PDF.
-- O browser apenas envia dados estruturados; a escrita fica centralizada numa RPC protegida.
create or replace function public.admin_importar_socios_pdf(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  numero integer;
  nome text;
  total integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Acesso reservado a administradores.';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Os dados da importação têm de ser uma lista.';
  end if;

  for row_data in select value from jsonb_array_elements(p_rows)
  loop
    numero := nullif(trim(row_data->>'numero_socio'), '')::integer;
    nome := nullif(trim(row_data->>'nome'), '');

    if numero is null or numero <= 0 or numero = 9999 then
      continue;
    end if;

    if nome is null or length(nome) < 3 then
      continue;
    end if;

    insert into public.socios (numero_socio, nome, ativo, tipo_utilizador, is_admin, quotas)
    values (numero, nome, true, 'socio'::public.tipo_utilizador, false, 'Em dia')
    on conflict (numero_socio)
    do update set
      nome = excluded.nome,
      updated_at = now();

    total := total + 1;
  end loop;

  return jsonb_build_object('importados', total);
end;
$$;

revoke execute on function public.admin_importar_socios_pdf(jsonb) from anon;
grant execute on function public.admin_importar_socios_pdf(jsonb) to authenticated;
