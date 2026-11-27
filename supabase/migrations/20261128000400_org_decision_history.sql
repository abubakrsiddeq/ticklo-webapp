-- =============================================================================
-- Decision history for organizers (D-077)
-- The audit log stays admins-only (RLS). Society owners and members read their
-- own society's part of it through this function:
--   society: registered, approved, rejected, resubmitted
--   events:  sent for review, approved, rejected, cancelled
--   payments (orders of the society's events): approved, rejected
--   team registrations and ambassador applications of the society's events
-- A TickLO admin who decided is shown as "TickLO team", not by name.
-- =============================================================================

create or replace function public.org_decision_history(
  p_org_id uuid,
  p_actions text[] default null,
  p_event_id uuid default null,
  p_q text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id bigint,
  action text,
  created_at timestamptz,
  actor_name text,
  by_ticklo boolean,
  event_id uuid,
  event_name text,
  subject text,
  extra text,
  reason text,
  order_id uuid,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_allowed constant text[] := array[
    'org.register', 'org.resubmit', 'org.approve', 'org.reject',
    'event.submit', 'event.approve', 'event.reject', 'event.cancel',
    'order.approve', 'order.reject',
    'team.approve', 'team.reject',
    'ambassador.approve', 'ambassador.reject'
  ];
  v_actions text[];
  v_q text := nullif(trim(coalesce(p_q, '')), '');
begin
  if not (public.is_org_staff(p_org_id) or public.is_admin()) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only this society''s organizers can see its history.';
  end if;
  select coalesce(array_agg(a), '{}') into v_actions
  from unnest(coalesce(p_actions, v_allowed)) a
  where a = any (v_allowed);

  return query
  with evs as (
    select e.id, e.name from public.events e
    where e.org_id = p_org_id and (p_event_id is null or e.id = p_event_id)
  ),
  log as (
    select a.*, null::uuid as ev_id, null::uuid as ord_id
    from public.audit_log a
    where p_event_id is null and a.target_type = 'organization' and a.target_id = p_org_id::text
    union all
    select a.*, evs.id, null::uuid
    from public.audit_log a join evs on a.target_type = 'event' and a.target_id = evs.id::text
    union all
    select a.*, o.event_id, o.id
    from public.orders o
    join evs on evs.id = o.event_id
    join public.audit_log a on a.target_type = 'order' and a.target_id = o.id::text
  ),
  described as (
    select
      l.id, l.action, l.created_at,
      case
        when l.actor_id is null then null
        when ap.is_admin and not exists (
          select 1 from public.organization_members m where m.org_id = p_org_id and m.user_id = l.actor_id
        ) then 'TickLO team'
        else coalesce(ap.full_name, 'Deleted account')
      end as actor_name,
      coalesce(ap.is_admin, false) and not exists (
        select 1 from public.organization_members m where m.org_id = p_org_id and m.user_id = l.actor_id
      ) as by_ticklo,
      l.ev_id,
      ev.name as event_name,
      case
        when l.target_type = 'organization' then coalesce(org.name, l.details->>'name')
        when l.action like 'team.%' then coalesce(tr.team_name, l.details->>'team', 'Team')
        when l.action like 'ambassador.%' then coalesce(applicant.full_name, 'Applicant')
        when l.target_type = 'order' then coalesce(o.ref_code, l.details->>'ref_code')
        else coalesce(ev.name, l.details->>'name')
      end as subject,
      case
        when l.target_type = 'order' then o.buyer_name
        when l.action like 'team.%' then ses.name
        else null
      end as extra,
      coalesce(
        nullif(trim(l.details->>'note'), ''),
        nullif(trim(l.details->>'reason'), ''),
        nullif(trim(l.details->>'previous_note'), ''),
        case when l.action = 'team.reject' then nullif(trim(tr.reject_reason), '') end
      ) as reason,
      l.ord_id
    from log l
    left join public.profiles ap on ap.id = l.actor_id
    left join public.organizations org on l.target_type = 'organization' and org.id = p_org_id
    left join public.events ev on ev.id = l.ev_id
    left join public.orders o on o.id = l.ord_id
    left join public.team_registrations tr on l.action like 'team.%' and tr.id::text = l.details->>'registration_id'
    left join public.event_sessions ses on ses.id = tr.session_id
    left join public.profiles applicant on l.action like 'ambassador.%' and applicant.id::text = l.details->>'user_id'
    where l.action = any (v_actions)
  )
  select d.id, d.action, d.created_at, d.actor_name, d.by_ticklo, d.ev_id, d.event_name, d.subject, d.extra, d.reason, d.ord_id,
         count(*) over () as total_count
  from described d
  where v_q is null
     or d.subject ilike '%' || v_q || '%'
     or d.extra ilike '%' || v_q || '%'
     or d.event_name ilike '%' || v_q || '%'
     or d.actor_name ilike '%' || v_q || '%'
  order by d.created_at desc, d.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.org_decision_history(uuid, text[], uuid, text, integer, integer) from public, anon;
grant execute on function public.org_decision_history(uuid, text[], uuid, text, integer, integer) to authenticated;
