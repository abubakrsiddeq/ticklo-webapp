-- =============================================================================
-- TickLO v1 – Realtime, pg_cron schedule, function privileges
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Realtime (ORG-08 live check-ins, SCN-08 live count, TKT-04 ticket "used")
-- RLS still decides who receives which rows.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.checkins, public.orders, public.tickets;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- pg_cron: release expired holds every minute (PAY-10). Skipped where the
-- extension is unavailable (e.g. plain local Postgres used for tests).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    execute $cron$select cron.schedule('ticklo-expire-holds', '* * * * *', 'select public.expire_stale_orders()')$cron$;
  end if;
exception when others then
  raise notice 'pg_cron not scheduled: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges. Supabase grants EXECUTE to anon/authenticated by
-- default; we revoke everything and grant only what each role needs.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Helpers used inside RLS / storage policies must be executable by callers
grant execute on function
  public.try_uuid(text),
  public.is_active_user(uuid),
  public.is_admin(),
  public.org_role_of(uuid, uuid),
  public.is_org_staff(uuid),
  public.is_org_owner(uuid),
  public.is_org_member_any(uuid),
  public.event_org_id(uuid),
  public.is_event_staff(uuid),
  public.can_scan_event(uuid, uuid),
  public.shares_org_as_staff(uuid),
  public.has_order_for_event(uuid),
  public.event_availability(uuid)
to anon, authenticated;

-- Signed-in user actions (each checks permissions itself)
grant execute on function
  public.create_order(uuid, jsonb, text, text),
  public.approve_order(uuid),
  public.reject_order(uuid, text),
  public.manual_check_in(uuid, text),
  public.assign_scanner(uuid, uuid),
  public.unassign_scanner(uuid, uuid),
  public.my_scan_events(),
  public.scanner_attendees(uuid),
  public.event_stats(uuid),
  public.create_organization(text, text, uuid, public.org_type, text, text, jsonb, text),
  public.resubmit_organization(uuid),
  public.review_organization(uuid, boolean, text),
  public.invite_to_org(uuid, text, public.org_role),
  public.get_invite(text),
  public.accept_org_invite(text),
  public.revoke_invite(uuid),
  public.update_member_role(uuid, uuid, public.org_role),
  public.remove_member(uuid, uuid),
  public.org_team(uuid),
  public.submit_event(uuid),
  public.review_event(uuid, boolean, text),
  public.cancel_event(uuid, text),
  public.admin_set_user_suspended(uuid, boolean, text),
  public.admin_save_university(uuid, text, text, text, text),
  public.admin_delete_university(uuid),
  public.admin_resolve_dispute(uuid, text),
  public.admin_log(text, text, text, jsonb),
  public.admin_repeat_rejections(integer),
  public.admin_overview(),
  public.request_account_deletion()
to authenticated;

-- NOT granted to anon/authenticated (service role only):
--   submit_payment_proof, perform_check_in, log_checkin_attempt, issue_tickets,
--   expire_stale_orders, rate_limit_hit, events_due_for_reminder, audit,
--   ticket_type_taken, generate_ref_code, generate_ticket_code, trigger functions.
