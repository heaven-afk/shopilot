create table public.platform_admins(user_id uuid primary key references auth.users(id),role text not null check(role in ('owner','admin','viewer')),created_at timestamptz not null default now(),granted_by uuid references auth.users(id));
create table public.platform_audit(id bigint generated always as identity primary key,actor_id uuid not null references auth.users(id),action text not null,target_user uuid references auth.users(id),created_at timestamptz not null default now());
create table public.device_sync_health(business_id uuid not null references public.businesses(id),device_id uuid not null,user_id uuid not null references auth.users(id),last_synced_at timestamptz not null default now(),primary key(business_id,device_id));
alter table public.platform_admins enable row level security;
alter table public.platform_audit enable row level security;
alter table public.device_sync_health enable row level security;
revoke all on public.platform_admins,public.platform_audit,public.device_sync_health from anon,authenticated;
create function public.platform_access() returns text language sql stable security definer set search_path=public as $$select a.role from platform_admins a join auth.users u on u.id=a.user_id where a.user_id=auth.uid() and u.email_confirmed_at is not null$$;
create function public.platform_dashboard() returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if platform_access() is null then raise exception 'Platform administrator access required'; end if;
 return jsonb_build_object(
 'businessCount',(select count(*) from businesses),'accountCount',(select count(*) from auth.users),'staffCount',(select count(*) from memberships where role<>'owner'),'salesCount',(select count(*) from sales),'scansToday',coalesce((select sum(count) from scan_usage where usage_date=current_date),0),'activeBusinesses',(select count(distinct business_id) from device_sync_health where last_synced_at>now()-interval '24 hours'),
 'businesses',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select b.id,b.name,b.business_type,b.created_at,u.email as owner_email,(select max(last_synced_at) from device_sync_health h where h.business_id=b.id) as last_synced_at,(select count(*) from memberships m where m.business_id=b.id) as members,(select count(*) from sales s where s.business_id=b.id) as sales from businesses b join auth.users u on u.id=b.owner_id order by b.created_at desc limit 200) x),'[]'::jsonb),
 'administrators',coalesce((select jsonb_agg(jsonb_build_object('userId',a.user_id,'email',u.email,'role',a.role)) from platform_admins a join auth.users u on u.id=a.user_id),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(to_jsonb(x)) from (select a.action,a.created_at,actor.email as actor_email,target.email as target_email from platform_audit a join auth.users actor on actor.id=a.actor_id left join auth.users target on target.id=a.target_user order by a.created_at desc limit 30) x),'[]'::jsonb));
end;$$;
create function public.set_platform_access(target_email text,access_role text) returns void language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
 lock table platform_admins in share row exclusive mode;
 if platform_access() is distinct from 'owner' then raise exception 'Only the platform owner can change administrator access'; end if;
 if access_role not in ('owner','admin','viewer','remove') then raise exception 'Invalid administrator role'; end if;
 select id into target from auth.users where lower(email)=lower(trim(target_email)) and email_confirmed_at is not null;
 if target is null then raise exception 'That person must register and confirm their email first'; end if;
 if exists(select 1 from platform_admins where user_id=target and role='owner') and access_role<>'owner' and (select count(*) from platform_admins where role='owner')<=1 then raise exception 'At least one platform owner must remain'; end if;
 if access_role='remove' then delete from platform_admins where user_id=target;else insert into platform_admins(user_id,role,granted_by) values(target,access_role,auth.uid()) on conflict(user_id) do update set role=excluded.role,granted_by=excluded.granted_by;end if;
 insert into platform_audit(actor_id,action,target_user) values(auth.uid(),'platform_access_'||access_role,target);
end;$$;
revoke all on function public.platform_access(),public.platform_dashboard(),public.set_platform_access(text,text) from public,anon;
grant execute on function public.platform_access(),public.platform_dashboard(),public.set_platform_access(text,text) to authenticated;
