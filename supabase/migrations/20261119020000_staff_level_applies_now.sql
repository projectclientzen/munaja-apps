-- Owner report 18 Nov 2026: a staff account changed from level 3 to level 1 still opened tonight's session at level 3.
-- A night session keeps the level it was created with (right for buyers: a new level starts with the next session).
-- For staff, the admin's change should apply at once. So when the level changes, the staff member's open session
-- (tonight and later) is removed if nothing has been recorded in it yet; the next open builds it at the new level.
-- A session that already has progress stays as it is, and the new level starts with the next session.

create or replace function app_private.staff_reset_open_sessions(p_uid uuid, p_now timestamptz) returns int
language plpgsql security definer set search_path = '' as $$
declare v_key date := app_private.user_active_key(p_uid, p_now); v_n int := 0;
begin
  if v_key is null then return 0; end if;
  delete from public.night_sessions s
   where s.user_id = p_uid
     and s.fajr_local_date >= v_key
     and s.status in ('scheduled', 'in_progress')
     and s.level_number <> app_private.staff_level(p_uid)
     and not exists (select 1 from public.session_activities a
                     where a.session_id = s.id and (a.actual_count > 0 or a.status <> 'pending'))
     and not exists (select 1 from public.session_quran_completions q where q.session_id = s.id);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function app_private.admin_staff_set_level(
  p_actor uuid, p_roles text[], p_id uuid, p_starting_level int, p_reason text, p_now timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.access_entitlements; v_before jsonb; v_reason text; v_lvl int; v_reset int := 0;
begin
  perform app_private.admin_require(p_actor, p_roles);
  v_reason := app_private.admin_reason(p_reason);
  v_lvl := p_starting_level;
  if v_lvl is null or v_lvl < 1 or v_lvl > 3 then
    perform app_private.fail('VALIDATION_ERROR', '{"field":"starting_level","reason":"must_be_1_to_3"}');
  end if;
  select * into e from public.access_entitlements
   where id = p_id and entitlement_type = 'staff_comp' for update;
  if e.id is null then perform app_private.fail('NOT_FOUND'); end if;
  if e.status = 'revoked' then
    perform app_private.fail('INVALID_TRANSITION', pg_catalog.jsonb_build_object('from', e.status, 'to', 'active')::text);
  end if;
  v_before := app_private.admin_entitlement_json(e);
  update public.access_entitlements set starting_level = v_lvl where id = e.id returning * into e;
  if e.user_id is not null then v_reset := app_private.staff_reset_open_sessions(e.user_id, p_now); end if;
  perform app_private.admin_audit(p_actor, 'entitlement', e.id::text, 'staff.level_changed', v_before,
    app_private.admin_entitlement_json(e) || pg_catalog.jsonb_build_object('open_sessions_reset', v_reset), v_reason, null, p_now);
  return app_private.admin_entitlement_json(e) || pg_catalog.jsonb_build_object('open_sessions_reset', v_reset);
end $$;

-- One-time fix for staff whose level was changed before this migration (the reported account).
select app_private.staff_reset_open_sessions(e.user_id, app_private.server_now())
from public.access_entitlements e
where e.entitlement_type = 'staff_comp' and e.status = 'active' and e.user_id is not null;

grant execute on all functions in schema app_private to service_role;
