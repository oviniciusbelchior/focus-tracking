-- Subcontas por cliente (27/11/2026). Só acrescenta: nada existente muda de comportamento.
-- Cada cliente é uma linha em empresas; o acesso continua por membros.

alter table public.empresas add column if not exists ativo boolean not null default true;
alter table public.membros add column if not exists principal boolean not null default false;

-- Cria um cliente novo. Só quem é dono de alguma empresa (a agência) pode criar.
-- Entram como donos do novo cliente quem chamou e os outros donos das empresas dele.
create or replace function public.criar_cliente(p_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare emp uuid; nm text := left(trim(coalesce(p_nome,'')), 120);
begin
  if auth.uid() is null or not exists (select 1 from public.membros where user_id = auth.uid() and papel = 'dono') then raise exception 'sem_permissao'; end if;
  if nm = '' then raise exception 'nome_vazio'; end if;
  insert into public.empresas(nome, dados) values (nm, jsonb_build_object('co', jsonb_build_object('name', nm))) returning id into emp;
  insert into public.membros(empresa_id, user_id, email, papel)
    select distinct on (m2.user_id) emp, m2.user_id, m2.email, 'dono'::papel
    from public.membros m1 join public.membros m2 on m2.empresa_id = m1.empresa_id and m2.papel = 'dono'
    where m1.user_id = auth.uid() and m1.papel = 'dono'
  on conflict do nothing;
  return emp;
end $$;

-- Marca (ou desmarca, com null) o cliente principal de quem chamou: é onde o sistema abre.
create or replace function public.marcar_principal(p_empresa uuid)
returns void language sql security definer set search_path = public as $$
  update public.membros set principal = coalesce(empresa_id = p_empresa, false) where user_id = auth.uid() and (principal or empresa_id = p_empresa);
$$;

revoke all on function public.criar_cliente(text) from public, anon;
revoke all on function public.marcar_principal(uuid) from public, anon;
grant execute on function public.criar_cliente(text) to authenticated;
grant execute on function public.marcar_principal(uuid) to authenticated;
