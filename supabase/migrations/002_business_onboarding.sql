alter table public.businesses add column business_type text not null default 'Retail shop' check(business_type in ('Retail shop','Wholesaler','Retail & wholesale','Other small business'));
alter table public.businesses add column phone text not null default '' check(length(phone)<=40);
alter table public.businesses add column address text not null default '' check(length(address)<=300);
create function public.setup_business(workspace_name text,business_type text,business_phone text,business_address text)
returns uuid language plpgsql security definer set search_path=public as $$
declare bid uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 bid:=public.create_workspace(workspace_name);
 update public.businesses set business_type=setup_business.business_type,phone=trim(business_phone),address=trim(business_address) where id=bid;
 insert into public.audit_logs(business_id,actor_id,action) values(bid,auth.uid(),'business_created');
 return bid;
end;$$;
revoke all on function public.setup_business(text,text,text,text) from public,anon;
grant execute on function public.setup_business(text,text,text,text) to authenticated;
