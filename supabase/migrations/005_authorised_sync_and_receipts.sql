alter table public.sales add column receipt_branding jsonb not null default '{}'::jsonb check(jsonb_typeof(receipt_branding)='object' and octet_length(receipt_branding::text)<=6000);
alter function public.sync_workspace(uuid,jsonb) rename to sync_workspace_core;
revoke all on function public.sync_workspace_core(uuid,jsonb) from public,anon,authenticated;
create function public.sync_workspace(bid uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; result jsonb; new_sale_ids uuid[]; s jsonb; branding jsonb; defaults jsonb;
begin
 actor_role:=public.business_role(bid);
 if actor_role is null then raise exception 'Workspace access denied'; end if;
 perform 1 from businesses where id=bid for update;
 if actor_role='staff' and (
  exists(select 1 from jsonb_array_elements(payload->'products') p where not exists(select 1 from products where business_id=bid and id=(p->>'id')::uuid)) or
  exists(select 1 from jsonb_array_elements(payload->'movements') m where not exists(select 1 from stock_movements where business_id=bid and id=(m->>'id')::uuid))
 ) then raise exception 'Only an owner or manager can add products or change stock'; end if;
 select array_agg((value->>'id')::uuid) into new_sale_ids from jsonb_array_elements(payload->'sales') where not exists(select 1 from sales where business_id=bid and id=(value->>'id')::uuid);
 result:=public.sync_workspace_core(bid,payload);
 for s in select value from jsonb_array_elements(payload->'sales') where (value->>'id')::uuid=any(coalesce(new_sale_ids,'{}'::uuid[])) loop
  select jsonb_build_object('name',name,'phone',phone,'address',address,'footer',receipt_footer,'width',receipt_width,'logoUrl',logo_url) into defaults from businesses where id=bid;
  branding:=defaults||coalesce(s->'branding','{}'::jsonb);
  if jsonb_typeof(branding)<>'object' or exists(select 1 from jsonb_each(branding) where key not in ('name','phone','address','footer','width','logoUrl'))
   or jsonb_typeof(branding->'name')<>'string' or length(trim(branding->>'name')) not between 1 and 120
   or jsonb_typeof(branding->'phone')<>'string' or length(branding->>'phone')>40
   or jsonb_typeof(branding->'address')<>'string' or length(branding->>'address')>300
   or jsonb_typeof(branding->'footer')<>'string' or length(branding->>'footer')>240
   or jsonb_typeof(branding->'width')<>'number' or branding->>'width' not in ('58','80')
   or jsonb_typeof(branding->'logoUrl')<>'string' or length(branding->>'logoUrl')>1000 or (branding->>'logoUrl'<>'' and branding->>'logoUrl' not like 'https://%') then raise exception 'Invalid receipt branding';end if;
  update sales set receipt_branding=branding where business_id=bid and id=(s->>'id')::uuid;
 end loop;
 result:=jsonb_set(result,'{sales}',coalesce((select jsonb_agg(entry||jsonb_build_object('branding',s.receipt_branding)) from jsonb_array_elements(result->'sales') entry join sales s on s.business_id=bid and s.id=(entry->>'id')::uuid),'[]'::jsonb));
 if payload->>'deviceId' is not null then insert into device_sync_health(business_id,device_id,user_id,last_synced_at) values(bid,(payload->>'deviceId')::uuid,auth.uid(),now()) on conflict(business_id,device_id) do update set user_id=auth.uid(),last_synced_at=now();end if;
 return result;
end;$$;
revoke all on function public.sync_workspace(uuid,jsonb) from public,anon;
grant execute on function public.sync_workspace(uuid,jsonb) to authenticated;
