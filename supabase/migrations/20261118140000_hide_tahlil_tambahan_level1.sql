-- Hide "Tahlil tambahan (opsional, total 300)" from Level 1 (owner request, 16 Nov 2026).
-- The activity definition stays; only the level-1 night config row is deactivated and pushed to the end.
update public.level_activity_config c
set is_active = false, sequence_order = 999
from public.levels l, public.activity_definitions a
where c.level_id = l.id and c.activity_definition_id = a.id
  and l.level_number = 1 and a.activity_key = 'tahlil_tambahan';

-- Close the gap in the active level-1 night sequence.
with numbered as (
  select c.id, row_number() over (partition by c.level_id, c.phase order by c.sequence_order) as rn
  from public.level_activity_config c
  join public.levels l on l.id = c.level_id
  where l.level_number = 1 and c.phase = 'night' and c.is_active
)
update public.level_activity_config c set sequence_order = n.rn from numbered n where c.id = n.id;
