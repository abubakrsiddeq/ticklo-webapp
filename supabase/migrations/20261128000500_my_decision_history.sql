-- =============================================================================
-- Decision history for students (D-078)
-- A signed-in user reads the decisions about their own things:
--   payments of their orders (approved / rejected, or cancelled by them)
--   their team registrations (as team lead) and ambassador applications
--   TickLO's answer to their payment reports (disputes)
-- Who decided is shown as the society's name for organizer decisions and as
-- "TickLO team" for TickLO admins; organizers' personal names are not shared.
-- =============================================================================

create or replace function public.my_decision_history(
  p_order_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id bigint,
  action text,
  created_at timestamptz,
  decided_by text,
  by_ticklo boolean,
  subject text,
  extra text,
  reason text,
  amount_paisa bigint,
  order_id uuid,
  event_name text,
  event_slug text,
  org_slug text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using message = 'TL:AUTH_REQUIRED', detail = 'Please log in.';
  end if;

  return query
  with log as (
    -- payments of my orders
    select a.id, a.action, a.actor_id, a.details, a.created_at, o.event_id as ev_id, o.id as ord_id,
           o.ref_code as subj, (o.ticket_count || case when o.ticket_count = 1 then ' ticket' else ' tickets' end) as ext,
           o.total_paisa as amount, null::text as fallback_reason
    from public.orders o
    join public.audit_log a on a.target_type = 'order' and a.target_id = o.id::text
    where o.user_id = v_uid
      and a.action in ('order.approve', 'order.reject', 'order.cancel_by_buyer')
      and (p_order_id is null or o.id = p_order_id)
    union all
    -- TickLO's answer to my reports
    select a.id, a.action, a.actor_id, a.details, a.created_at, o.event_id, o.id,
           'Report on ' || o.ref_code, null::text, null::bigint, d.admin_note
    from public.disputes d
    join public.orders o on o.id = d.order_id
    join public.audit_log a on a.target_type = 'dispute' and a.target_id = d.id::text
    where d.user_id = v_uid and a.action = 'dispute.resolve'
      and (p_order_id is null or o.id = p_order_id)
    union all
    -- my team registrations (as team lead)
    select a.id, a.action, a.actor_id, a.details, a.created_at, tr.event_id, tr.order_id,
           tr.team_name, ses.name, null::bigint, case when a.action = 'team.reject' then tr.reject_reason end
    from public.team_registrations tr
    join public.event_sessions ses on ses.id = tr.session_id
    join public.audit_log a on a.target_type = 'event' and a.target_id = tr.event_id::text
      and a.details->>'registration_id' = tr.id::text
    where tr.user_id = v_uid and a.action in ('team.approve', 'team.reject')
      and p_order_id is null
    union all
    -- my ambassador applications
    select a.id, a.action, a.actor_id, a.details, a.created_at, aa.event_id, null::uuid,
           'Ambassador application', null::text, null::bigint, null::text
    from public.ambassador_applications aa
    join public.audit_log a on a.target_type = 'event' and a.target_id = aa.event_id::text
      and a.details->>'application_id' = aa.id::text
    where aa.user_id = v_uid and a.action in ('ambassador.approve', 'ambassador.reject')
      and p_order_id is null
  ),
  described as (
    select
      l.id, l.action, l.created_at,
      case
        when l.actor_id = v_uid then 'You'
        when l.actor_id is null then 'TickLO'
        when ap.is_admin and not exists (
          select 1 from public.organization_members m where m.org_id = ev.org_id and m.user_id = l.actor_id
        ) then 'TickLO team'
        else org.name
      end as decided_by,
      l.actor_id is not null and l.actor_id <> v_uid and coalesce(ap.is_admin, false) and not exists (
        select 1 from public.organization_members m where m.org_id = ev.org_id and m.user_id = l.actor_id
      ) as by_ticklo,
      l.subj, l.ext,
      coalesce(
        nullif(trim(l.details->>'note'), ''),
        nullif(trim(l.details->>'reason'), ''),
        nullif(trim(l.fallback_reason), '')
      ) as reason,
      l.amount, l.ord_id, ev.name as event_name, ev.slug as event_slug, org.slug as org_slug
    from log l
    left join public.profiles ap on ap.id = l.actor_id
    left join public.events ev on ev.id = l.ev_id
    left join public.organizations org on org.id = ev.org_id
  )
  select d.id, d.action, d.created_at, d.decided_by, d.by_ticklo, d.subj, d.ext, d.reason, d.amount, d.ord_id,
         d.event_name, d.event_slug, d.org_slug, count(*) over () as total_count
  from described d
  order by d.created_at desc, d.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.my_decision_history(uuid, integer, integer) from public, anon;
grant execute on function public.my_decision_history(uuid, integer, integer) to authenticated;
