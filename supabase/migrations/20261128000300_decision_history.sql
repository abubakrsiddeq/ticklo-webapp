-- =============================================================================
-- Decision history (D-076)
-- Every accept / reject stays on record for admins:
--   1. the audit log is append-only (no edits, no deletes, no truncate). The one
--      allowed change is actor_id becoming null when that account is deleted
--      (the existing ON DELETE SET NULL), so the record itself survives.
--   2. the steps between decisions are recorded too, so a society's history
--      reads "registered → rejected (reason) → resubmitted → approved":
--      org.register, org.resubmit, event.submit (by triggers, so no existing
--      function has to change).
--   3. deleting a university keeps its name and city in the record.
-- =============================================================================

-- 1. Append-only audit log ----------------------------------------------------
create or replace function public.audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.actor_id is null
     and new.id = old.id
     and new.action = old.action
     and new.target_type = old.target_type
     and new.target_id is not distinct from old.target_id
     and new.details = old.details
     and new.created_at = old.created_at then
    return new; -- the actor's account was deleted; the record stays
  end if;
  raise exception using message = 'TL:FORBIDDEN', detail = 'The audit log is a permanent record and cannot be changed.';
end;
$$;

create trigger audit_log_no_update before update on public.audit_log
  for each row execute function public.audit_log_append_only();
create trigger audit_log_no_delete before delete on public.audit_log
  for each row execute function public.audit_log_append_only();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_append_only();

-- 2. Steps between decisions --------------------------------------------------
create or replace function public.audit_org_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit('org.register', 'organization', new.id::text,
      jsonb_build_object('name', new.name, 'type', new.type));
  elsif old.status = 'rejected' and new.status = 'pending' then
    perform public.audit('org.resubmit', 'organization', new.id::text,
      jsonb_build_object('name', new.name, 'previous_note', old.review_note));
  end if;
  return null;
end;
$$;

create trigger organizations_audit_insert after insert on public.organizations
  for each row execute function public.audit_org_lifecycle();
create trigger organizations_audit_status after update of status on public.organizations
  for each row when (old.status is distinct from new.status)
  execute function public.audit_org_lifecycle();

create or replace function public.audit_event_submit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.audit('event.submit', 'event', new.id::text,
    jsonb_build_object('name', new.name, 'org_id', new.org_id, 'resubmitted', old.status = 'rejected'));
  return null;
end;
$$;

create trigger events_audit_submit after update of status on public.events
  for each row when (new.status = 'pending_review' and old.status is distinct from new.status)
  execute function public.audit_event_submit();

revoke all on function public.audit_log_append_only() from public, anon, authenticated;
revoke all on function public.audit_org_lifecycle() from public, anon, authenticated;
revoke all on function public.audit_event_submit() from public, anon, authenticated;

-- 3. University delete keeps the name ----------------------------------------
create or replace function public.admin_delete_university(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uni public.universities;
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  delete from public.universities where id = p_id returning * into v_uni;
  perform public.audit('university.delete', 'university', p_id::text,
    case when v_uni.id is null then '{}'::jsonb
         else jsonb_build_object('name', v_uni.name, 'city', v_uni.city, 'status', v_uni.status) end);
end;
$$;
