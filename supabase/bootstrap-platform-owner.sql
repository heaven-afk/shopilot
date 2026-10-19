-- Run manually in the Supabase SQL editor AFTER migrations 003–005.
-- Targets Heaven's supplied account email. Change it if your Shopilot login differs.
-- This bootstrap is privileged SQL only: there is no public self-promotion endpoint.
do $$
declare owner_email text:='ogadizion01@gmail.com'; owner_id uuid;
begin
 select id into owner_id from auth.users where lower(email)=lower(owner_email) and email_confirmed_at is not null;
 if owner_id is null then raise exception 'Register and confirm the owner account before bootstrapping administrator access'; end if;
 if exists(select 1 from public.platform_admins) then raise exception 'Platform access is already configured. Use the admin dashboard to grant additional access.'; end if;
 insert into public.platform_admins(user_id,role) values(owner_id,'owner');
end;$$;
