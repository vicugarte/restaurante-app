create table if not exists public.barman_etl_ejecuciones (
  id bigint generated always as identity primary key,
  respaldo_nombre text not null,
  respaldo_sha256 text not null,
  fecha_respaldo timestamptz,
  ventana_desde date,
  ejecutado_en timestamptz not null default now(),
  ventas_extraidas integer not null default 0,
  productos_extraidos integer not null default 0,
  pagos_extraidos integer not null default 0,
  cortesias_extraidas integer not null default 0,
  max_venta_id bigint,
  estado text not null default 'ok',
  detalle text
);

create unique index if not exists barman_etl_ejecuciones_sha_ok
  on public.barman_etl_ejecuciones (respaldo_sha256)
  where estado = 'ok';

alter table public.barman_etl_ejecuciones enable row level security;

drop policy if exists "barman_etl_select_authenticated" on public.barman_etl_ejecuciones;
create policy "barman_etl_select_authenticated"
  on public.barman_etl_ejecuciones
  for select
  to authenticated
  using (true);
