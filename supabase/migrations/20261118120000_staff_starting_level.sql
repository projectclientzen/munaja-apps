-- Staff starting level (owner request, 16 Nov 2026): when an admin creates a staff account they choose the level
-- the staff member starts at (1 = Fondasi, 2 = Bertumbuh, 3 = Istikamah) instead of always level 3.
-- Default 3 keeps existing behaviour for staff accounts created before this migration.
alter table public.access_entitlements
  add column if not exists starting_level smallint not null default 3 check (starting_level between 1 and 3);

-- The active staff level. Active staff_comp entitlement's starting_level, otherwise the normal progression.
-- Replaces app_private.has_all_levels (hardcoded 3) while keeping its name available to any older callers.
create or replace function app_private.has_all_levels(p_uid uuid) returns boolean
language sql stable set search_path = '' as $$
  select p_uid is not null and exists (
    select 1 from public.access_entitlements e
    where e.user_id = p_uid and e.entitlement_type = 'staff_comp' and e.status = 'active'
  )
$$;

-- Level for a session: active staff use their chosen starting_level; everyone else uses the normal progression.
create or replace function app_private.level_for_session(p_uid uuid, p_key date) returns int
language sql stable set search_path = '' as $$
  select coalesce(
    (select e.starting_level from public.access_entitlements e
     where e.user_id = p_uid and e.entitlement_type = 'staff_comp' and e.status = 'active'),
    (select case when st.level_3_effective_from <= p_key then 3 when st.level_2_effective_from <= p_key then 2 else 1 end
     from public.user_level_state st where st.user_id = p_uid),
    1)
$$;

-- admin_staff_create accepts the starting level and stores it on the staff entitlement.
create or replace function app_private.admin_staff_create(
  p_actor uuid, p_roles text[], p_email text, p_display_name text, p_reason text, p_starting_level int, p_now timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_name text; v_reason text; v_uid uuid; e public.access_entitlements; v_lvl int;
begin
  perform app_private.admin_require(p_actor, p_roles);
  v_reason := app_private.admin_reason(p_reason);
  v_email := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or pg_catalog.char_length(v_email) > 254 then
    perform app_private.fail('VALIDATION_ERROR', '{"field":"email","reason":"invalid"}');
  end if;
  v_lvl := coalesce(p_starting_level, 3);
  if v_lvl < 1 or v_lvl > 3 then
    perform app_private.fail('VALIDATION_ERROR', '{"field":"starting_level","reason":"must_be_1_to_3"}');
  end if;
  v_name := app_private.admin_text(p_display_name, 60, false, 'display_name');
  -- Same lock as activate_account: a buyer activating this email at the same moment waits for us.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('activate:' || v_email));
  if exists (select 1 from public.profiles pr where pr.email_normalized = v_email)
     or exists (select 1 from auth.users u where u.email = v_email) then
    perform app_private.fail('CONFLICT', '{"reason":"account_exists"}');
  end if;
  -- An email that already has an entitlement (a paid order waiting for its buyer) is not ours to take.
  if exists (select 1 from public.access_entitlements x where x.email_normalized = v_email) then
    perform app_private.fail('CONFLICT', '{"reason":"email_has_entitlement"}');
  end if;
  v_uid := gen_random_uuid();
  insert into auth.users (id, email) values (v_uid, v_email);
  insert into public.profiles (user_id, email_normalized, display_name) values (v_uid, v_email, v_name);
  insert into public.access_entitlements (user_id, email_normalized, entitlement_type, status, starts_at, granted_by, starting_level)
  values (v_uid, v_email, 'staff_comp', 'active', p_now, p_actor, v_lvl) returning * into e;
  perform app_private.admin_audit(p_actor, 'entitlement', e.id::text, 'staff.created', null,
    app_private.admin_entitlement_json(e), v_reason, null, p_now);
  return pg_catalog.jsonb_build_object('user_id', v_uid, 'entitlement', app_private.admin_entitlement_json(e));
end $$;

-- Staff list exposes the starting level so the admin sees what they chose.
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
  ), '[]'::jsonb);
end $$;

grant execute on all functions in schema app_private to service_role;
