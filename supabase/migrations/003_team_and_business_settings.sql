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
