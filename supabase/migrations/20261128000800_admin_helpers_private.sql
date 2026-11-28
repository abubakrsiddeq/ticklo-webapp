-- D-084 follow-up: the internal helpers of the admin migration are only called
-- inside other functions (which run as their owner). Supabase's default
-- privileges had also given signed-in users EXECUTE on them; org_owner_contact
-- would have shown any society owner's email. Take that away.
revoke execute on function
  public.org_is_frozen(uuid),
  public.admin_stop_org_events(uuid, text, boolean),
  public.org_owner_contact(uuid),
  public.event_has_bookings(uuid),
  public.guard_frozen_org(),
  public.guard_event_sales()
from public, anon, authenticated;

grant execute on function
  public.org_is_frozen(uuid),
  public.admin_stop_org_events(uuid, text, boolean),
  public.org_owner_contact(uuid),
  public.event_has_bookings(uuid)
to service_role;
