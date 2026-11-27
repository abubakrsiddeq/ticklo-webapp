-- =============================================================================
-- TickLO – early-bird prices (D-072)
--
-- Any ticket type – including a competition's entry fee – can have a lower
-- early-bird price until a date. The database charges it (create_order and
-- promo maths use the price in force), so screens cannot be fooled. A team that
-- applied (shortlisting) before the early-bird date keeps that price when it pays.
-- =============================================================================

alter table public.ticket_types
  add column early_price_paisa integer,
  add column early_until timestamptz,
  add constraint ticket_types_early_pair check ((early_price_paisa is null) = (early_until is null)),
  add constraint ticket_types_early_price check (early_price_paisa is null or (early_price_paisa >= 0 and early_price_paisa < price_paisa));

-- The price in force at a moment (early bird before early_until)
create or replace function public.ticket_type_price_at(p_type public.ticket_types, p_at timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when p_type.early_price_paisa is not null and p_at < p_type.early_until then p_type.early_price_paisa else p_type.price_paisa end;
$$;

create or replace function public.discount_for(p_items jsonb, p_type text, p_value integer, p_type_ids uuid[] default null)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    (e ->> 'quantity')::int::bigint * case p_type
      when 'fixed' then least(p_value, public.ticket_type_price_at(tt, now()))
      when 'percent' then round(public.ticket_type_price_at(tt, now())::numeric * p_value / 100)::bigint
      else 0
    end
  ), 0)::bigint
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  join public.ticket_types tt on tt.id = (e ->> 'ticket_type_id')::uuid
  where p_type in ('fixed', 'percent') and (p_type_ids is null or tt.id = any (p_type_ids));
$$;

create or replace function public.create_order(
  p_event_id uuid,
  p_items jsonb,
  p_buyer_name text default null,
  p_buyer_phone text default null,
  p_code text default null,
  p_ref text default null,
  p_answers jsonb default null,
  p_registration_id uuid default null,
  p_attendees jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_event public.events;
  v_items jsonb := p_items;
  v_item jsonb;
  v_type public.ticket_types;
  v_type_ids uuid[];
  v_qty int;
  v_total_qty int := 0;
  v_total bigint := 0;
  v_requires_card boolean := false;
  v_taken int;
  v_sale_end timestamptz;
  v_existing public.orders;
  v_status public.order_status;
  v_order_id uuid;
  v_ref text;
  -- codes
  v_code text := public.normalize_code(p_code);
  v_link text := public.normalize_code(p_ref);
  v_promo public.promo_codes;
  v_seller public.print_sellers;
  v_source text;
  v_cfg public.referral_settings;
  v_eligible_qty int;
  v_promo_discount bigint := 0;
  v_seller_discount bigint := 0;
  v_discount bigint := 0;
  v_promo_id uuid;
  -- festivals
  v_reg public.team_registrations;
  v_session public.event_sessions;
  v_answers jsonb := '{}'::jsonb;
  v_attendees jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in to book tickets.';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in to book tickets.';
  end if;
  if v_profile.is_suspended then
    raise exception using message = 'TL:SUSPENDED', detail = 'Your account is suspended.';
  end if;

  -- AUTH-06: name and phone can be filled in right here at checkout
  if p_buyer_name is not null and char_length(trim(p_buyer_name)) >= 2 then
    v_profile.full_name := left(trim(p_buyer_name), 100);
    update public.profiles set full_name = v_profile.full_name where id = v_uid;
  end if;
  if p_buyer_phone is not null and char_length(trim(p_buyer_phone)) between 8 and 20 then
    v_profile.phone := trim(p_buyer_phone);
    update public.profiles set phone = v_profile.phone where id = v_uid;
  end if;
  if coalesce(char_length(trim(v_profile.full_name)), 0) < 2 or coalesce(char_length(trim(v_profile.phone)), 0) < 8 then
    raise exception using message = 'TL:PROFILE_INCOMPLETE', detail = 'Please add your full name and phone number first.';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Event not found.';
  end if;
  if v_event.status = 'cancelled' then
    raise exception using message = 'TL:EVENT_CANCELLED', detail = 'This event has been cancelled.';
  end if;
  if v_event.status <> 'published' then
    raise exception using message = 'TL:EVENT_NOT_ON_SALE', detail = 'Tickets for this event are not on sale.';
  end if;

  if p_registration_id is not null then
    -- FES-10: paying for a team registration
    select * into v_reg from public.team_registrations where id = p_registration_id for update;
    if not found or v_reg.user_id <> v_uid or v_reg.event_id <> p_event_id then
      raise exception using message = 'TL:NOT_FOUND', detail = 'Registration not found.';
    end if;
    if v_reg.status <> 'approved' then
      raise exception using message = 'TL:INVALID_STATE',
        detail = case v_reg.status when 'pending' then 'The organizer has not accepted your team yet.' else 'This registration is closed.' end;
    end if;
    if v_reg.order_id is not null then
      select * into v_existing from public.orders o where o.id = v_reg.order_id;
      if v_existing.status in ('approved', 'under_review', 'rejected')
         or (v_existing.status = 'awaiting_payment' and v_existing.hold_expires_at > now()) then
        return jsonb_build_object(
          'order_id', v_existing.id, 'ref_code', v_existing.ref_code, 'status', v_existing.status,
          'total_paisa', v_existing.total_paisa, 'discount_paisa', v_existing.discount_paisa, 'existing', true
        );
      end if;
    end if;
    select * into v_session from public.event_sessions where id = v_reg.session_id for update;
    select * into v_type from public.ticket_types where registration_session_id = v_session.id;
    if v_type.id is null then
      raise exception using message = 'TL:INVALID_STATE', detail = 'Registration for this competition is not set up.';
    end if;
    -- D-064: places held by other teams (this team's own hold does not count against it)
    if public.session_teams_taken_except(v_session.id, v_reg.id) >= coalesce(v_session.capacity, 0) then
      raise exception using message = 'TL:SOLD_OUT', detail = format('"%s" is full – no team places left.', v_session.name);
    end if;
    v_items := jsonb_build_array(jsonb_build_object(
      'ticket_type_id', v_type.id,
      'quantity', case when v_session.fee_mode = 'per_member' then v_reg.member_count else 1 end
    ));
    v_type := null;
  else
    -- D-007: one unpaid booking per event per user (team payments are separate)
    select * into v_existing
    from public.orders o
    where o.user_id = v_uid and o.event_id = p_event_id
      and o.status = 'awaiting_payment' and o.hold_expires_at > now()
      and not exists (select 1 from public.team_registrations r where r.order_id = o.id)
    order by o.created_at desc
    limit 1;
    if found then
      return jsonb_build_object(
        'order_id', v_existing.id, 'ref_code', v_existing.ref_code, 'status', v_existing.status,
        'total_paisa', v_existing.total_paisa, 'discount_paisa', v_existing.discount_paisa, 'existing', true
      );
    end if;
  end if;

  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose at least one ticket.';
  end if;

  select array_agg(x.id order by x.id) into v_type_ids
  from (select distinct (elem ->> 'ticket_type_id')::uuid as id from jsonb_array_elements(v_items) elem) x;
  if coalesce(array_length(v_type_ids, 1), 0) <> jsonb_array_length(v_items) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Each ticket type can appear only once.';
  end if;

  -- Lock in a stable order to avoid deadlocks between concurrent buyers
  perform 1 from public.ticket_types tt where tt.id = any (v_type_ids) order by tt.id for update;

  for v_item in select * from jsonb_array_elements(v_items) loop
    v_qty := (v_item ->> 'quantity')::int;
    if v_qty is null or v_qty < 1 then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'Quantity must be at least 1.';
    end if;

    select * into v_type from public.ticket_types tt
    where tt.id = (v_item ->> 'ticket_type_id')::uuid and tt.event_id = p_event_id;
    if not found then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'That ticket type does not belong to this event.';
    end if;
    if v_type.registration_session_id is not null and p_registration_id is null then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'Competition entries are made by registering your team.';
    end if;

    if v_type.sale_starts_at is not null and now() < v_type.sale_starts_at then
      raise exception using message = 'TL:SALE_NOT_STARTED', detail = format('Sale for "%s" has not started yet.', v_type.name);
    end if;
    -- rule 3: no end date → booking closes when the event starts. D-064: festival tickets sell until
    -- their session starts (passes: the last pass session); an accepted team can pay until its competition starts.
    v_sale_end := case
      when p_registration_id is not null then v_session.starts_at
      else coalesce(v_type.sale_ends_at, public.ticket_type_default_sale_end(v_type.id))
    end;
    if now() >= v_sale_end then
      raise exception using message = 'TL:SALE_CLOSED', detail = format('Sale for "%s" is closed.', v_type.name);
    end if;

    v_taken := public.ticket_type_taken(v_type.id);
    if v_type.quantity - v_taken < v_qty then
      raise exception using message = 'TL:SOLD_OUT',
        detail = case
          when v_type.quantity - v_taken <= 0 then format('"%s" is sold out.', v_type.name)
          else format('Only %s "%s" ticket(s) left.', v_type.quantity - v_taken, v_type.name)
        end;
    end if;

    v_total_qty := v_total_qty + v_qty;
    v_total := v_total + (v_qty::bigint * public.ticket_type_price_at(v_type, coalesce(v_reg.created_at, now())));
    v_requires_card := v_requires_card or v_type.requires_student_card;
  end loop;

  if p_registration_id is null and v_total_qty > v_event.max_tickets_per_order then
    raise exception using message = 'TL:MAX_PER_ORDER',
      detail = format('You can book at most %s tickets in one order.', v_event.max_tickets_per_order);
  end if;

  -- FES-03: session seats (after the ticket types are locked)
  perform public.assert_session_capacity(v_items);

  -- D-064: one entry per ticket (holder name / university when the event asks, and the answers to
  -- session questions per ticket). orders.answers keeps the first ticket's answers for older screens.
  if p_registration_id is null then
    v_attendees := public.clean_attendees(v_event, v_items, p_attendees, p_answers);
    select coalesce(jsonb_object_agg(x.k, x.v), '{}'::jsonb) into v_answers
    from (
      select distinct on (j.k) j.k, j.v
      from jsonb_array_elements(v_attendees) with ordinality a(e, n)
      cross join lateral jsonb_each(coalesce(a.e -> 'answers', '{}'::jsonb)) j(k, v)
      order by j.k, a.n
    ) x;
  end if;

  -- ---- Codes (AMB-04, AMB-07) ----
  if v_code is not null then
    select * into v_promo from public.promo_codes pc where pc.event_id = p_event_id and pc.code = v_code for update;
    if found then
      if not v_promo.active then
        raise exception using message = 'TL:INVALID_CODE', detail = 'This code is turned off.';
      end if;
      if v_promo.starts_at is not null and now() < v_promo.starts_at then
        raise exception using message = 'TL:INVALID_CODE', detail = 'This code is not active yet.';
      end if;
      if v_promo.ends_at is not null and now() >= v_promo.ends_at then
        raise exception using message = 'TL:INVALID_CODE', detail = 'This code has expired.';
      end if;
      if v_promo.max_uses is not null and public.promo_code_uses(v_promo.id) >= v_promo.max_uses then
        raise exception using message = 'TL:INVALID_CODE', detail = 'This code has been used up.';
      end if;
      select coalesce(sum((e ->> 'quantity')::int), 0) into v_eligible_qty
      from jsonb_array_elements(v_items) e
      where v_promo.ticket_type_ids is null or (e ->> 'ticket_type_id')::uuid = any (v_promo.ticket_type_ids);
      if v_eligible_qty = 0 then
        raise exception using message = 'TL:INVALID_CODE', detail = 'This code does not work for the tickets you chose.';
      end if;
      if v_eligible_qty < v_promo.min_tickets then
        raise exception using message = 'TL:INVALID_CODE',
          detail = format('Choose at least %s tickets to use this code.', v_promo.min_tickets);
      end if;
      v_promo_discount := public.discount_for(v_items, v_promo.discount_type, v_promo.discount_value, v_promo.ticket_type_ids);
    else
      select * into v_seller from public.print_sellers s where s.event_id = p_event_id and s.ref_code = v_code;
      if not found then
        raise exception using message = 'TL:INVALID_CODE', detail = 'This code is not valid for this event.';
      end if;
      if v_seller.settled_at is not null then
        raise exception using message = 'TL:INVALID_CODE', detail = 'This ambassador code is no longer active.';
      end if;
      v_source := 'code';
    end if;
  end if;

  if v_seller.id is null and v_link is not null then
    select * into v_seller from public.print_sellers s
    where s.event_id = p_event_id and s.ref_code = v_link and s.settled_at is null;
    if found then
      v_source := 'link';
    end if;
  end if;

  -- AMB-12: nobody earns from their own booking
  if v_seller.id is not null and (
    v_seller.user_id = v_uid
    or (public.phone_key(v_seller.phone) is not null and public.phone_key(v_seller.phone) = public.phone_key(v_profile.phone))
  ) then
    if v_source = 'code' then
      raise exception using message = 'TL:OWN_CODE', detail = 'You cannot use your own ambassador code.';
    end if;
    v_seller := null;
    v_source := null;
  end if;

  if v_seller.id is not null then
    select * into v_cfg from public.referral_settings where event_id = p_event_id;
    if found then
      v_seller_discount := public.discount_for(v_items, v_cfg.discount_type, v_cfg.discount_value, null);
    end if;
  end if;

  if v_promo.id is not null and v_promo_discount >= v_seller_discount then
    v_discount := v_promo_discount;
    v_promo_id := v_promo.id;
  else
    v_discount := v_seller_discount;
  end if;
  v_discount := least(v_discount, v_total);
  v_total := v_total - v_discount;

  v_status := case
    when v_total = 0 and not v_requires_card then 'approved'::public.order_status
    else 'awaiting_payment'::public.order_status
  end;

  v_ref := public.generate_ref_code();
  insert into public.orders (
    ref_code, event_id, user_id, status, total_paisa, ticket_count, requires_student_card,
    hold_expires_at, buyer_name, buyer_email, buyer_phone, approved_at, decided_at,
    seller_id, referral_source, promo_code_id, discount_paisa, answers, attendees
  )
  values (
    v_ref, p_event_id, v_uid, v_status, v_total, v_total_qty, v_requires_card,
    case when v_status = 'awaiting_payment' then now() + interval '60 minutes' end,
    v_profile.full_name, v_profile.email, v_profile.phone,
    case when v_status = 'approved' then now() end,
    case when v_status = 'approved' then now() end,
    v_seller.id, v_source, v_promo_id, v_discount, v_answers, v_attendees
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, ticket_type_id, quantity, unit_price_paisa)
  select v_order_id, tt.id, (e ->> 'quantity')::int, public.ticket_type_price_at(tt, coalesce(v_reg.created_at, now()))
  from jsonb_array_elements(v_items) e
  join public.ticket_types tt on tt.id = (e ->> 'ticket_type_id')::uuid;

  if p_registration_id is not null then
    update public.team_registrations set order_id = v_order_id where id = p_registration_id;
  end if;

  if v_status = 'approved' then
    perform public.issue_tickets(v_order_id);
  end if;

  return jsonb_build_object(
    'order_id', v_order_id, 'ref_code', v_ref, 'status', v_status,
    'total_paisa', v_total, 'discount_paisa', v_discount, 'existing', false
  );
end;
$$;

drop function public.event_schedule(uuid);

create function public.event_schedule(p_event_id uuid)
returns table (
  id uuid, name text, kind text, description text, venue text, starts_at timestamptz, ends_at timestamptz,
  capacity integer, remaining integer, pass_access boolean, questions jsonb, team_min integer, team_max integer,
  fee_mode text, fee_paisa integer, needs_approval boolean, registration_type_id uuid, registration_ends_at timestamptz,
  results jsonb, member_required text[], attendee_names text, attendee_university text, poster_url text, form jsonb, slug text, listed boolean, early_fee_paisa integer, early_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.kind, s.description, s.venue, s.starts_at, s.ends_at, s.capacity,
         public.session_remaining(s.id), s.pass_access, s.questions, s.team_min, s.team_max, s.fee_mode,
         rt.price_paisa, s.needs_approval, rt.id, coalesce(rt.sale_ends_at, case when s.kind = 'competition' then s.starts_at end),
         case when s.results_published then s.results else '[]'::jsonb end, s.member_required, s.attendee_names, s.attendee_university, s.poster_url,
         case when s.kind = 'competition' then public.session_form(s)
              else jsonb_build_object('member', public.ticket_fields_of_session(s), 'team', '[]'::jsonb) end,
         s.slug, s.listed, rt.early_price_paisa, rt.early_until
  from public.event_sessions s
  join public.events e on e.id = s.event_id
  left join public.ticket_types rt on rt.registration_session_id = s.id
  where s.event_id = p_event_id
    and (e.status in ('published', 'cancelled') or public.is_org_member_any(e.org_id) or public.is_admin())
  order by s.starts_at, s.sort_order;
$$;

revoke all on function public.event_schedule(uuid) from public;
grant execute on function public.event_schedule(uuid) to anon, authenticated, service_role;
revoke all on function public.ticket_type_price_at(public.ticket_types, timestamptz) from public, anon;
grant execute on function public.ticket_type_price_at(public.ticket_types, timestamptz) to authenticated, service_role;
