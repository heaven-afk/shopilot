-- Shopilot upgrade. Apply ONCE after migrations 001 and 002.
-- This transaction does not grant any platform administrator automatically.
begin;
-- 003_team_and_business_settings.sql
alter table public.memberships drop constraint memberships_role_check;
alter table public.memberships add constraint memberships_role_check check(role in ('owner','manager','staff'));
alter table public.businesses add column receipt_footer text not null default 'Thank you for shopping with us.' check(length(receipt_footer)<=240);
alter table public.businesses add column receipt_width integer not null default 80 check(receipt_width in (58,80));
alter table public.businesses add column logo_url text not null default '' check(length(logo_url)<=1000 and (logo_url='' or logo_url like 'https://%'));
create function public.business_role(bid uuid) returns text language sql stable security definer set search_path=public as $$select role from memberships where business_id=bid and user_id=auth.uid()$$;
create function public.may_scan_stock() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from memberships where user_id=auth.uid() and role in ('owner','manager'))$$;
revoke all on function public.may_scan_stock() from public,anon;
grant execute on function public.may_scan_stock() to authenticated;

create table public.staff_invitations (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id), email text not null check(length(email)<=254), role text not null check(role in ('manager','staff')), invited_by uuid not null references auth.users(id), created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days', accepted_at timestamptz, revoked_at timestamptz
);
create unique index one_pending_staff_invite on public.staff_invitations(business_id,lower(email)) where accepted_at is null and revoked_at is null;
alter table public.staff_invitations enable row level security;
revoke all on public.staff_invitations from anon,authenticated;

create function public.invite_staff(bid uuid,staff_email text,staff_role text) returns uuid language plpgsql security definer set search_path=public as $$
declare invitation_id uuid; target_email text:=lower(trim(staff_email));
begin
 if public.business_role(bid) is distinct from 'owner' then raise exception 'Only the business owner can invite staff'; end if;
 if target_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(target_email)>254 then raise exception 'Enter a valid email address'; end if;
 if staff_role not in ('manager','staff') then raise exception 'Choose a staff or manager role'; end if;
 if exists(select 1 from memberships m join auth.users u on u.id=m.user_id where m.business_id=bid and lower(u.email)=target_email) then raise exception 'This person is already a team member'; end if;
 update staff_invitations set revoked_at=now() where business_id=bid and lower(email)=target_email and accepted_at is null and revoked_at is null and expires_at<=now();
 insert into staff_invitations(business_id,email,role,invited_by) values(bid,target_email,staff_role,auth.uid()) returning id into invitation_id;
 insert into audit_logs(business_id,actor_id,action) values(bid,auth.uid(),'staff_invited');
 return invitation_id;
end;$$;
create function public.my_invitations() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'businessName',b.name,'role',i.role,'expiresAt',i.expires_at)),'[]'::jsonb) from staff_invitations i join businesses b on b.id=i.business_id join auth.users u on u.id=auth.uid() where lower(u.email)=lower(i.email) and u.email_confirmed_at is not null and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()
$$;
create function public.accept_staff_invitation(invitation_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare invitation staff_invitations; current_email text;
begin
 select lower(email) into current_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if current_email is null then raise exception 'Sign in with a confirmed email to accept this invitation'; end if;
 select * into invitation from staff_invitations where id=invitation_id for update;
 if not found or lower(invitation.email)<>current_email or invitation.revoked_at is not null or invitation.expires_at<=now() then raise exception 'This invitation is unavailable for your account'; end if;
 if invitation.accepted_at is not null then raise exception 'This invitation has already been accepted'; end if;
 insert into memberships(business_id,user_id,role) values(invitation.business_id,auth.uid(),invitation.role) on conflict do nothing;
 update staff_invitations set accepted_at=now() where id=invitation_id;
 insert into audit_logs(business_id,actor_id,action) values(invitation.business_id,auth.uid(),'staff_invitation_accepted');
 return invitation.business_id;
end;$$;
create function public.business_team(bid uuid) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if business_role(bid) is distinct from 'owner' then raise exception 'Only the business owner can manage the team'; end if;
 return jsonb_build_object('members',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'email',u.email,'role',m.role)) from memberships m join auth.users u on u.id=m.user_id where m.business_id=bid),'[]'::jsonb),'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email,'role',role,'expiresAt',expires_at,'acceptedAt',accepted_at,'revokedAt',revoked_at) order by created_at desc) from staff_invitations where business_id=bid),'[]'::jsonb));
end;$$;
create function public.update_team_access(bid uuid,target_user uuid,new_role text) returns void language plpgsql security definer set search_path=public as $$
begin
 if business_role(bid) is distinct from 'owner' then raise exception 'Only the business owner can change team access'; end if;
 if target_user=auth.uid() or exists(select 1 from memberships where business_id=bid and user_id=target_user and role='owner') then raise exception 'The owner account cannot be changed here'; end if;
 if new_role not in ('staff','manager','remove') then raise exception 'Invalid team role'; end if;
 if new_role='remove' then delete from memberships where business_id=bid and user_id=target_user;
 else update memberships set role=new_role where business_id=bid and user_id=target_user; end if;
 insert into audit_logs(business_id,actor_id,action) values(bid,auth.uid(),'team_access_changed');
end;$$;
create function public.revoke_staff_invitation(bid uuid,invitation_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if business_role(bid) is distinct from 'owner' then raise exception 'Only the business owner can revoke invitations'; end if;
 update staff_invitations set revoked_at=now() where id=invitation_id and business_id=bid and accepted_at is null;
 insert into audit_logs(business_id,actor_id,action) values(bid,auth.uid(),'staff_invitation_revoked');
end;$$;
create function public.update_business_settings(bid uuid,details jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if business_role(bid) is distinct from 'owner' then raise exception 'Only the business owner can edit business settings'; end if;
 update businesses set name=trim(details->>'name'),business_type=details->>'business_type',phone=trim(coalesce(details->>'phone','')),address=trim(coalesce(details->>'address','')),receipt_footer=coalesce(details->>'receipt_footer','Thank you for shopping with us.'),receipt_width=(details->>'receipt_width')::integer,logo_url=coalesce(details->>'logo_url','') where id=bid returning to_jsonb(businesses.*) into result;
 insert into audit_logs(business_id,actor_id,action) values(bid,auth.uid(),'business_settings_updated');
 return result;
end;$$;
revoke all on function public.business_role(uuid),public.invite_staff(uuid,text,text),public.my_invitations(),public.accept_staff_invitation(uuid),public.business_team(uuid),public.update_team_access(uuid,uuid,text),public.revoke_staff_invitation(uuid,uuid),public.update_business_settings(uuid,jsonb) from public,anon;
grant execute on function public.business_role(uuid),public.invite_staff(uuid,text,text),public.my_invitations(),public.accept_staff_invitation(uuid),public.business_team(uuid),public.update_team_access(uuid,uuid,text),public.revoke_staff_invitation(uuid,uuid),public.update_business_settings(uuid,jsonb) to authenticated;


-- 004_platform_admin.sql
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


-- 005_authorised_sync_and_receipts.sql
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

commit;
