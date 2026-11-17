-- Staff starting level, follow-up to 20261118120000 (orchestrator review, 17 Nov 2026).
-- 1. Before a staff member's first session, the dashboard and level screen showed level 3 whatever level the admin
--    chose, while the session itself used the chosen level. Both now use the same value.
-- 2. The old 6-argument admin_staff_create stays callable after 20261118120000 added a 7-argument one. The app only
--    calls the new one; the old overload is dropped so no path can create staff without a level.

create or replace function app_private.staff_level(p_uid uuid) returns int
language sql stable set search_path = '' as $$
  select coalesce((
    select e.starting_level::int from public.access_entitlements e
    where e.user_id = p_uid and e.entitlement_type = 'staff_comp' and e.status = 'active'
    order by e.created_at desc limit 1), 3)
$$;

-- Same rule for the session itself, through the one helper (a second staff_comp row can no longer break the subquery).
create or replace function app_private.level_for_session(p_uid uuid, p_key date) returns int
language sql stable set search_path = '' as $$
  select case when app_private.has_all_levels(p_uid) then app_private.staff_level(p_uid) else coalesce(
    (select case when st.level_3_effective_from <= p_key then 3 when st.level_2_effective_from <= p_key then 2 else 1 end
     from public.user_level_state st where st.user_id = p_uid), 1) end
$$;

create or replace function app_private.level_progress_json(p_uid uuid, p_now timestamptz) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  st public.user_level_state; v_active date; v_start date; v_cur int; v_l3_done int; v_l3_req int;
  v_all boolean := app_private.has_all_levels(p_uid);
begin
  select * into st from public.user_level_state where user_id = p_uid;
  select p.program_start_date into v_start from public.profiles p where p.user_id = p_uid;
  v_active := app_private.user_active_key(p_uid, p_now);
  v_cur := case when v_active is null then (case when v_all then app_private.staff_level(p_uid) else 1 end) else app_private.level_for_session(p_uid, v_active) end;
  select count(*) into v_l3_done from public.night_sessions n where n.user_id = p_uid and n.level_number = 3 and n.status = 'completed';
  select l.required_successful_nights into v_l3_req from public.levels l where l.level_number = 3;
  return pg_catalog.jsonb_build_object(
    'current_level', v_cur,
    'levels', (
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'level', l.level_number,
        'completed', c.n,
        'required', l.required_successful_nights,
        'ratio', least(1.0::float8, c.n::float8 / l.required_successful_nights),
        'unlocked', case when v_all then true else case l.level_number when 1 then true when 2 then st.level_2_effective_from is not null
                    else st.level_3_effective_from is not null end end,
        'is_current', l.level_number = v_cur,
        'effective_from_session_key', case when v_all then v_start else case l.level_number when 1 then v_start when 2 then st.level_2_effective_from
                                      else st.level_3_effective_from end end
      ) order by l.level_number)
      from public.levels l
      cross join lateral (
        select count(*)::int as n from public.night_sessions n
        where n.user_id = p_uid and n.level_number = l.level_number and n.status = 'completed'
      ) c),
    'journey_completed', v_l3_done >= v_l3_req,
    -- Required nights are still provisional until the owner approves them (PRD §30.2).
    'provisional', true);
end $$;

create or replace function app_private.get_current_level(p_uid uuid, p_now timestamptz) returns jsonb
language plpgsql stable set search_path = '' as $$
declare v_active date; v_lvl int; st public.user_level_state; v_start date; v_all boolean := app_private.has_all_levels(p_uid);
begin
  perform app_private.require_active(p_uid, p_now);
  v_active := app_private.user_active_key(p_uid, p_now);
  v_lvl := case when v_active is null then (case when v_all then app_private.staff_level(p_uid) else 1 end) else app_private.level_for_session(p_uid, v_active) end;
  select * into st from public.user_level_state where user_id = p_uid;
  select p.program_start_date into v_start from public.profiles p where p.user_id = p_uid;
  return pg_catalog.jsonb_build_object(
    'level', v_lvl,
    'effective_from_session_key', case when v_all then v_start else case v_lvl when 1 then v_start when 2 then st.level_2_effective_from else st.level_3_effective_from end end);
end $$;

drop function if exists app_private.admin_staff_create(uuid, text[], text, text, text, timestamptz);

grant execute on all functions in schema app_private to service_role;
