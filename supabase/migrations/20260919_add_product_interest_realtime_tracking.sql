create table if not exists public.product_interest_counts (
  product_id text primary key references public.products(id) on delete cascade,
  interest_count integer not null default 0 check (interest_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.product_interest_counts enable row level security;
grant select on public.product_interest_counts to anon, authenticated;
revoke insert, update, delete on public.product_interest_counts from anon, authenticated;

drop policy if exists "Public can read product interest counts" on public.product_interest_counts;
create policy "Public can read product interest counts"
on public.product_interest_counts
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.products p
    where p.id = product_interest_counts.product_id
      and p.sale_status in ('available','sold_out')
  )
);

create table if not exists public.product_interests (
  product_id text not null references public.products(id) on delete cascade,
  visitor_hash text not null check (length(visitor_hash) = 64),
  created_at timestamptz not null default now(),
  primary key (product_id, visitor_hash)
);

alter table public.product_interests enable row level security;
revoke all on public.product_interests from anon, authenticated;

create or replace function public.sync_product_interest_count()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.product_interest_counts(product_id, interest_count, updated_at)
    values (new.product_id, 1, now())
    on conflict (product_id)
    do update set
      interest_count = public.product_interest_counts.interest_count + 1,
      updated_at = now();
    return new;
  elsif tg_op = 'DELETE' then
    update public.product_interest_counts
    set interest_count = greatest(interest_count - 1, 0),
        updated_at = now()
    where product_id = old.product_id;
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.sync_product_interest_count() from public, anon, authenticated;

drop trigger if exists trg_sync_product_interest_count_insert on public.product_interests;
create trigger trg_sync_product_interest_count_insert
after insert on public.product_interests
for each row execute function public.sync_product_interest_count();

drop trigger if exists trg_sync_product_interest_count_delete on public.product_interests;
create trigger trg_sync_product_interest_count_delete
after delete on public.product_interests
for each row execute function public.sync_product_interest_count();

insert into public.product_interest_counts(product_id, interest_count)
select p.id, count(i.product_id)::integer
from public.products p
left join public.product_interests i on i.product_id = p.id
group by p.id
on conflict (product_id)
do update set interest_count = excluded.interest_count, updated_at = now();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='product_interest_counts'
  ) then
    alter publication supabase_realtime add table public.product_interest_counts;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
end
$$;
