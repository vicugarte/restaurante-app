-- Primera entrega comercial: proteger las tablas que consume el navegador.
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- La service_role seguirá teniendo acceso para procesos administrativos.

alter table public.barman_ventas enable row level security;
alter table public.barman_productos enable row level security;
alter table public.barman_pagos enable row level security;
alter table public.barman_cortesias enable row level security;

drop policy if exists "comercial_lectura_autenticados" on public.barman_ventas;
create policy "comercial_lectura_autenticados"
on public.barman_ventas
for select
to authenticated
using (true);

drop policy if exists "comercial_lectura_autenticados" on public.barman_productos;
create policy "comercial_lectura_autenticados"
on public.barman_productos
for select
to authenticated
using (true);

drop policy if exists "comercial_lectura_autenticados" on public.barman_pagos;
create policy "comercial_lectura_autenticados"
on public.barman_pagos
for select
to authenticated
using (true);

drop policy if exists "comercial_lectura_autenticados" on public.barman_cortesias;
create policy "comercial_lectura_autenticados"
on public.barman_cortesias
for select
to authenticated
using (true);
