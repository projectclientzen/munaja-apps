-- Admin accounts also get app access (owner report 18 Nov 2026: opening the app with the super_admin account landed on
-- /access-status because that account was made by the bootstrap script with a role but no entitlement).
-- The access is a staff_comp entitlement marked as automatic by granted_by = the user's own id (an admin can never
-- create staff for an existing account, so that value is unique to this path). It follows the role: added when the
-- first role is granted, revoked when the last role is removed. Staff rules apply (all levels, outside buyer reports).

create or replace function app_private.ensure_admin_app_access(p_uid uuid, p_now timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare v_email text; e public.access_entitlements;
begin
  if p_uid is null then return; end if;
  if exists (select 1 from public.access_entitlements x
             where x.user_id = p_uid and x.entitlement_type = 'staff_comp' and x.status = 'active') then
    return;
  end if;
  select pr.email_normalized into v_email from public.profiles pr where pr.user_id = p_uid;
  if v_email is null then select pg_catalog.lower(u.email) into v_email from auth.users u where u.id = p_uid; end if;
  if v_email is null then return; end if;
  insert into public.access_entitlements (user_id, email_normalized, entitlement_type, status, starts_at, granted_by, starting_level)
  values (p_uid, v_email, 'staff_comp', 'active', p_now, p_uid, 3) returning * into e;
  perform app_private.admin_audit(null, 'entitlement', e.id::text, 'staff.auto_for_admin', null,
    app_private.admin_entitlement_json(e), 'Akses aplikasi otomatis untuk akun admin', null, p_now);
end $$;

create or replace function app_private.user_roles_app_access() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := app_private.server_now(); e public.access_entitlements;
begin
  if tg_op = 'INSERT' then
    perform app_private.ensure_admin_app_access(new.user_id, coalesce(new.granted_at, v_now));
  elsif not exists (select 1 from public.user_roles r where r.user_id = old.user_id) then
    for e in
      update public.access_entitlements
         set status = 'revoked', revoked_at = v_now, revoke_reason = 'admin_role_removed'
       where user_id = old.user_id and entitlement_type = 'staff_comp' and status = 'active' and granted_by = old.user_id
      returning *
    loop
      perform app_private.admin_audit(null, 'entitlement', e.id::text, 'staff.auto_revoked', null,
        app_private.admin_entitlement_json(e), 'Peran admin terakhir dicabut', null, v_now);
    end loop;
  end if;
  return null;
end $$;

drop trigger if exists user_roles_app_access on public.user_roles;
create trigger user_roles_app_access after insert or delete on public.user_roles
  for each row execute function app_private.user_roles_app_access();

-- Existing admin accounts (the live super_admin) get their access now.
select app_private.ensure_admin_app_access(r.user_id, app_private.server_now())
from (select distinct user_id from public.user_roles) r;

-- The staff screen lists accounts made as staff; automatic admin access is managed through roles.
create or replace function app_private.admin_staff_list(p_actor uuid, p_roles text[]) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
  perform app_private.admin_require(p_actor, p_roles);
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'entitlement_id', e.id, 'user_id', e.user_id, 'email', e.email_normalized, 'display_name', p.display_name,
      'status', e.status, 'starting_level', e.starting_level, 'created_at', app_private.iso(e.created_at),
      'revoked_at', app_private.iso(e.revoked_at), 'revoke_reason', e.revoke_reason,
      'granted_by_email', app_private.admin_email_of(e.granted_by),
      'has_password', exists (select 1 from public.auth_credentials c where c.user_id = e.user_id))
      order by e.created_at desc)
    from public.access_entitlements e left join public.profiles p on p.user_id = e.user_id
    where e.entitlement_type = 'staff_comp'
      and e.granted_by is distinct from e.user_id  -- automatic access of admin accounts is managed through roles
  ), '[]'::jsonb);
end $$;

grant execute on all functions in schema app_private to service_role;
