
create or replace function public.lead_facets()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'status_counts', coalesce((
      select jsonb_object_agg(status, c)
      from (select status, count(*)::int as c from public.leads group by status) s
    ), '{}'::jsonb),
    'industry_counts', coalesce((
      select jsonb_object_agg(industry, c)
      from (select industry, count(*)::int as c from public.leads where status='new' group by industry) i
    ), '{}'::jsonb),
    'total', (select count(*)::int from public.leads),
    'contacted_today', (select count(*)::int from public.leads where last_contacted = current_date),
    'following_up', (select count(*)::int from public.leads where status='follow_up'),
    'in_pipeline', (select count(*)::int from public.leads where status='pipeline'),
    'archived', (select count(*)::int from public.leads where status='archived'),
    'new_total', (select count(*)::int from public.leads where status='new')
  );
$$;

grant execute on function public.lead_facets() to authenticated;
