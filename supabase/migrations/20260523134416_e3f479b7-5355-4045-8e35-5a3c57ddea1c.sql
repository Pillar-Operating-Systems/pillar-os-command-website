create table if not exists public.deployments (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  client_name text,
  deal_id uuid references public.pipeline_deals(id) on delete set null,
  assigned_to text,
  status text not null default 'pending',
  notes text
);

alter table public.deployments enable row level security;

create policy "Deployments: authenticated read"
  on public.deployments for select
  to authenticated
  using (public.has_role(auth.uid(), 'owner'::public.app_role) or public.has_role(auth.uid(), 'sales'::public.app_role));

create policy "Deployments: authenticated insert"
  on public.deployments for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'owner'::public.app_role) or public.has_role(auth.uid(), 'sales'::public.app_role));

create policy "Deployments: authenticated update"
  on public.deployments for update
  to authenticated
  using (public.has_role(auth.uid(), 'owner'::public.app_role) or public.has_role(auth.uid(), 'sales'::public.app_role))
  with check (public.has_role(auth.uid(), 'owner'::public.app_role) or public.has_role(auth.uid(), 'sales'::public.app_role));

create policy "Deployments: owners delete"
  on public.deployments for delete
  to authenticated
  using (public.has_role(auth.uid(), 'owner'::public.app_role));

create trigger update_deployments_updated_at
  before update on public.deployments
  for each row execute function public.update_updated_at_column();