-- Cola de respaldos BarMan para la app comercial.
-- Ejecutar UNA SOLA VEZ en Supabase > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.barman_importaciones (
  id uuid primary key default gen_random_uuid(),
  archivo text not null,
  storage_path text not null unique,
  tamano_bytes bigint not null default 0,
  estado text not null default 'pendiente',
  mensaje text,
  subido_por uuid default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  inicio_proceso timestamptz,
  fin_proceso timestamptz,
  hash_archivo text,
  ventas_nuevas integer not null default 0,
  ventas_modificadas integer not null default 0,
  ventas_procesadas integer not null default 0,
  productos_procesados integer not null default 0,
  pagos_procesados integer not null default 0,
  constraint barman_importaciones_estado_chk check (
    estado in ('subiendo','pendiente','descargando','restaurando','procesando','validando','importando','completado','error','error_subida')
  )
);

create index if not exists barman_importaciones_estado_idx
  on public.barman_importaciones (estado, creado_en);

create index if not exists barman_importaciones_creado_idx
  on public.barman_importaciones (creado_en desc);

alter table public.barman_importaciones enable row level security;

drop policy if exists "barman_importaciones_authenticated_select" on public.barman_importaciones;
create policy "barman_importaciones_authenticated_select"
on public.barman_importaciones for select
to authenticated
using (true);

drop policy if exists "barman_importaciones_authenticated_insert" on public.barman_importaciones;
create policy "barman_importaciones_authenticated_insert"
on public.barman_importaciones for insert
to authenticated
with check (subido_por = auth.uid());

drop policy if exists "barman_importaciones_authenticated_update" on public.barman_importaciones;
create policy "barman_importaciones_authenticated_update"
on public.barman_importaciones for update
to authenticated
using (subido_por = auth.uid())
with check (subido_por = auth.uid());

-- Bucket privado. 100 MB por respaldo.
insert into storage.buckets (id, name, public, file_size_limit)
values ('barman-respaldos', 'barman-respaldos', false, 104857600)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "barman_respaldos_authenticated_insert" on storage.objects;
create policy "barman_respaldos_authenticated_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'barman-respaldos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "barman_respaldos_authenticated_select" on storage.objects;
create policy "barman_respaldos_authenticated_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'barman-respaldos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

comment on table public.barman_importaciones is
'Cola e historial de respaldos BarMan cargados desde la aplicación y procesados por el worker Windows.';
