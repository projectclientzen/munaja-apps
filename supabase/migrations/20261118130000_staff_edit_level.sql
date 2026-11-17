-- Staff level editing (owner request, 16 Nov 2026): admin may change the starting level of an existing
-- staff account from the staff screen. Audited like every admin action.
create or replace function app_private.admin_staff_set_level(
  p_actor uuid, p_roles text[], p_id uuid, p_starting_level int, p_reason text, p_now timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.access_entitlements; v_before jsonb; v_reason text; v_lvl int;
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
  perform app_private.admin_audit(p_actor, 'entitlement', e.id::text, 'staff.level_changed', v_before,
    app_private.admin_entitlement_json(e), v_reason, null, p_now);
  return app_private.admin_entitlement_json(e);
end $$;

grant execute on all functions in schema app_private to service_role;
