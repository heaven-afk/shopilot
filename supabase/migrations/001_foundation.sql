-- Run once in a fresh Supabase project. All money is integer kobo.
create table public.businesses (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120), owner_id uuid not null unique references auth.users(id), created_at timestamptz not null default now()
);
create table public.memberships (
 business_id uuid not null references public.businesses(id), user_id uuid not null references auth.users(id), role text not null check(role in ('owner','staff')), primary key(business_id,user_id)
);
create function public.is_member(bid uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from memberships where business_id=bid and user_id=auth.uid())$$;
create table public.products (
 business_id uuid not null references public.businesses(id), id uuid not null, name text not null check(length(name) between 1 and 120), category text not null, unit text not null check(length(unit) between 1 and 80), cost bigint not null check(cost>=0), price bigint not null check(price>=0), threshold integer not null check(threshold>=0), primary key(business_id,id)
);
create table public.stock_movements (
 business_id uuid not null, id uuid not null, product_id uuid not null, quantity integer not null, reason text not null check(length(reason)>0), created_at timestamptz not null, recorded_by uuid not null references auth.users(id), primary key(business_id,id), foreign key(business_id,product_id) references public.products(business_id,id)
);
create table public.sales (
 business_id uuid not null references public.businesses(id), id uuid not null, created_at timestamptz not null, total bigint not null check(total>=0), paid bigint not null check(paid>=0 and paid<=total), method text not null, customer text not null default '', recorded_by uuid not null references auth.users(id), primary key(business_id,id), check(paid=total or length(trim(customer))>0)
);
create table public.sale_items (
 business_id uuid not null, sale_id uuid not null, position integer not null, product_id uuid not null, name text not null, quantity integer not null check(quantity>0), unit text not null, price bigint not null check(price>=0), cost bigint not null check(cost>=0), primary key(business_id,sale_id,position), foreign key(business_id,sale_id) references public.sales(business_id,id), foreign key(business_id,product_id) references public.products(business_id,id)
);
create table public.payments (
 business_id uuid not null, id uuid not null, sale_id uuid not null, amount bigint not null check(amount>0), method text not null, created_at timestamptz not null, recorded_by uuid not null references auth.users(id), primary key(business_id,id), foreign key(business_id,sale_id) references public.sales(business_id,id)
);
create table public.scan_usage (user_id uuid not null references auth.users(id), usage_date date not null, count integer not null default 0, primary key(user_id,usage_date));
create table public.audit_logs (id bigint generated always as identity primary key, business_id uuid not null references public.businesses(id), actor_id uuid not null references auth.users(id), action text not null, created_at timestamptz not null default now());
create index sales_business_date on public.sales(business_id,created_at desc);
create index movement_product on public.stock_movements(business_id,product_id);
alter table public.businesses enable row level security;
alter table public.memberships enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.scan_usage enable row level security;
alter table public.audit_logs enable row level security;
create policy business_read on public.businesses for select to authenticated using(public.is_member(id));
create policy membership_read on public.memberships for select to authenticated using(user_id=auth.uid());
create policy products_read on public.products for select to authenticated using(public.is_member(business_id));
create policy movements_read on public.stock_movements for select to authenticated using(public.is_member(business_id));
create policy sales_read on public.sales for select to authenticated using(public.is_member(business_id));
create policy items_read on public.sale_items for select to authenticated using(public.is_member(business_id));
create policy payments_read on public.payments for select to authenticated using(public.is_member(business_id));
create policy audit_read on public.audit_logs for select to authenticated using(public.is_member(business_id));
-- Writes go through validated functions only, not arbitrary client table writes.
revoke all on public.scan_usage from anon,authenticated;
create function public.create_workspace(workspace_name text) returns uuid language plpgsql security definer set search_path=public as $$
declare bid uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if exists(select 1 from memberships where user_id=auth.uid()) then raise exception 'An account already has a workspace'; end if;
 insert into businesses(name,owner_id) values(trim(workspace_name),auth.uid()) returning id into bid;
 insert into memberships values(bid,auth.uid(),'owner');
 return bid;
end;$$;
create function public.reserve_scan() returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if auth.uid() is null or not exists(select 1 from memberships where user_id=auth.uid()) then return false; end if;
 insert into scan_usage(user_id,usage_date,count) values(auth.uid(),current_date,1)
 on conflict(user_id,usage_date) do update set count=scan_usage.count+1 where scan_usage.count<30 returning count into n;
 return n is not null;
end;$$;
create function public.sync_workspace(bid uuid, payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare p jsonb; m jsonb; s jsonb; item jsonb; payment jsonb; pos integer; inserted integer; total_check numeric; due bigint; result jsonb;
begin
 if not public.is_member(bid) then raise exception 'Workspace access denied'; end if;
 -- Serialize sync for a business. Offline completed sales are preserved even when the resulting balance needs reconciliation.
 perform 1 from businesses where id=bid for update;
 if jsonb_array_length(payload->'products')>10000 or jsonb_array_length(payload->'sales')>10000 or jsonb_array_length(payload->'movements')>20000 then raise exception 'Sync batch too large'; end if;
 for p in select value from jsonb_array_elements(payload->'products') loop
  insert into products(business_id,id,name,category,unit,cost,price,threshold) values(bid,(p->>'id')::uuid,p->>'name',p->>'category',p->>'unit',(p->>'cost')::bigint,(p->>'price')::bigint,(p->>'threshold')::integer) on conflict do nothing;
 end loop;
 for m in select value from jsonb_array_elements(payload->'movements') loop
  insert into stock_movements(business_id,id,product_id,quantity,reason,created_at,recorded_by) values(bid,(m->>'id')::uuid,(m->>'productId')::uuid,(m->>'quantity')::integer,m->>'reason',(m->>'createdAt')::timestamptz,auth.uid()) on conflict do nothing;
 end loop;
 for s in select value from jsonb_array_elements(payload->'sales') loop
  if jsonb_array_length(s->'lines')=0 then raise exception 'Sale needs items'; end if;
  select sum((value->>'price')::numeric*(value->>'quantity')::numeric) into total_check from jsonb_array_elements(s->'lines');
  if total_check is distinct from (s->>'total')::numeric then raise exception 'Invalid sale total'; end if;
  insert into sales(business_id,id,created_at,total,paid,method,customer,recorded_by) values(bid,(s->>'id')::uuid,(s->>'createdAt')::timestamptz,(s->>'total')::bigint,(s->>'paid')::bigint,s->>'method',coalesce(s->>'customer',''),auth.uid()) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted>0 then
   pos:=0;
   for item in select value from jsonb_array_elements(s->'lines') loop
    insert into sale_items values(bid,(s->>'id')::uuid,pos,(item->>'productId')::uuid,item->>'name',(item->>'quantity')::integer,item->>'unit',(item->>'price')::bigint,(item->>'cost')::bigint);
    pos:=pos+1;
   end loop;
  end if;
 end loop;
 for payment in select value from jsonb_array_elements(coalesce(payload->'payments','[]'::jsonb)) loop
  if not exists(select 1 from payments where business_id=bid and id=(payment->>'id')::uuid) then
   select total-paid-coalesce((select sum(amount) from payments where business_id=bid and sale_id=(payment->>'saleId')::uuid),0) into due from sales where business_id=bid and id=(payment->>'saleId')::uuid;
   if due is null or (payment->>'amount')::bigint>due then raise exception 'Repayment exceeds current balance; reconcile payments from other devices'; end if;
   insert into payments values(bid,(payment->>'id')::uuid,(payment->>'saleId')::uuid,(payment->>'amount')::bigint,payment->>'method',(payment->>'createdAt')::timestamptz,auth.uid());
  end if;
 end loop;
 select jsonb_build_object(
  'payments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'saleId',sale_id,'amount',amount,'method',method,'createdAt',created_at) order by created_at desc) from payments where business_id=bid),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'category',p.category,'unit',p.unit,'cost',p.cost,'price',p.price,'threshold',p.threshold,'stock',coalesce((select sum(quantity) from stock_movements where business_id=bid and product_id=p.id),0)-coalesce((select sum(quantity) from sale_items where business_id=bid and product_id=p.id),0))) from products p where p.business_id=bid),'[]'::jsonb),
  'movements',coalesce((select jsonb_agg(jsonb_build_object('id',id,'productId',product_id,'quantity',quantity,'reason',reason,'createdAt',created_at) order by created_at desc) from stock_movements where business_id=bid),'[]'::jsonb),
  'sales',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'createdAt',s.created_at,'total',s.total,'paid',s.paid,'method',s.method,'customer',s.customer,'sync','synced','lines',(select jsonb_agg(jsonb_build_object('productId',i.product_id,'name',i.name,'quantity',i.quantity,'unit',i.unit,'price',i.price,'cost',i.cost) order by i.position) from sale_items i where i.business_id=bid and i.sale_id=s.id)) order by s.created_at desc) from sales s where s.business_id=bid),'[]'::jsonb)
 ) into result;
 insert into audit_logs(business_id,actor_id,action) values(bid,auth.uid(),'workspace_sync');
 return result;
end;$$;
revoke all on function public.is_member(uuid),public.create_workspace(text),public.reserve_scan(),public.sync_workspace(uuid,jsonb) from public,anon;
grant execute on function public.is_member(uuid),public.create_workspace(text),public.reserve_scan(),public.sync_workspace(uuid,jsonb) to authenticated;
