-- =============================================================================
-- TickLO seed data – LOCAL / STAGING ONLY. Never run on production.
-- All test accounts use the password:  TickLO@12345
--
--   admin@ticklo.test      TickLO admin
--   organizer@ticklo.test  owner of "LUMS Music Society"
--   member@ticklo.test     member of LUMS Music Society, owner of a pending society
--   scanner@ticklo.test    scanner, assigned to "Winter Gala 2026"
--   student@ticklo.test    normal student
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Universities (ADM-07)
-- ---------------------------------------------------------------------------
insert into public.universities (id, name, short_name, city, email_domain) values
  ('10000000-0000-4000-8000-000000000001', 'Lahore University of Management Sciences', 'LUMS', 'Lahore', 'lums.edu.pk'),
  ('10000000-0000-4000-8000-000000000002', 'National University of Sciences and Technology', 'NUST', 'Islamabad', 'nust.edu.pk'),
  ('10000000-0000-4000-8000-000000000003', 'FAST National University', 'FAST-NU Lahore', 'Lahore', 'nu.edu.pk'),
  ('10000000-0000-4000-8000-000000000004', 'FAST National University', 'FAST-NU Islamabad', 'Islamabad', 'nu.edu.pk'),
  ('10000000-0000-4000-8000-000000000005', 'FAST National University', 'FAST-NU Karachi', 'Karachi', 'nu.edu.pk'),
  ('10000000-0000-4000-8000-000000000006', 'Institute of Business Administration', 'IBA', 'Karachi', 'iba.edu.pk'),
  ('10000000-0000-4000-8000-000000000007', 'University of Engineering and Technology', 'UET Lahore', 'Lahore', 'uet.edu.pk'),
  ('10000000-0000-4000-8000-000000000008', 'University of the Punjab', 'PU', 'Lahore', 'pu.edu.pk'),
  ('10000000-0000-4000-8000-000000000009', 'COMSATS University', 'COMSATS', 'Islamabad', 'comsats.edu.pk'),
  ('10000000-0000-4000-8000-000000000010', 'Ghulam Ishaq Khan Institute', 'GIKI', 'Topi', 'giki.edu.pk'),
  ('10000000-0000-4000-8000-000000000011', 'NED University of Engineering and Technology', 'NED', 'Karachi', 'neduet.edu.pk'),
  ('10000000-0000-4000-8000-000000000012', 'Habib University', 'Habib', 'Karachi', 'habib.edu.pk'),
  ('10000000-0000-4000-8000-000000000013', 'Quaid-i-Azam University', 'QAU', 'Islamabad', 'qau.edu.pk'),
  ('10000000-0000-4000-8000-000000000014', 'Air University', 'AU', 'Islamabad', 'au.edu.pk'),
  ('10000000-0000-4000-8000-000000000015', 'University of Central Punjab', 'UCP', 'Lahore', 'ucp.edu.pk'),
  ('10000000-0000-4000-8000-000000000016', 'Bahria University', 'Bahria Islamabad', 'Islamabad', 'bahria.edu.pk'),
  ('10000000-0000-4000-8000-000000000017', 'Pakistan Institute of Engineering and Applied Sciences', 'PIEAS', 'Islamabad', 'pieas.edu.pk'),
  ('10000000-0000-4000-8000-000000000018', 'COMSATS University', 'COMSATS Lahore', 'Lahore', 'cuilahore.edu.pk'),
  ('10000000-0000-4000-8000-000000000019', 'Information Technology University', 'ITU', 'Lahore', 'itu.edu.pk'),
  ('10000000-0000-4000-8000-000000000020', 'Aga Khan University', 'AKU', 'Karachi', 'aku.edu'),
  ('10000000-0000-4000-8000-000000000021', 'University of Karachi', 'KU', 'Karachi', 'uok.edu.pk'),
  ('10000000-0000-4000-8000-000000000022', 'Bahria University', 'Bahria Karachi', 'Karachi', 'bahria.edu.pk')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Auth users (profiles are created by the on_auth_user_created trigger)
-- ---------------------------------------------------------------------------
do $$
declare
  v_users jsonb := '[
    {"id":"00000000-0000-4000-8000-000000000001","email":"admin@ticklo.test","name":"TickLO Admin"},
    {"id":"00000000-0000-4000-8000-000000000002","email":"organizer@ticklo.test","name":"Ayesha Khan"},
    {"id":"00000000-0000-4000-8000-000000000003","email":"student@ticklo.test","name":"Ali Raza"},
    {"id":"00000000-0000-4000-8000-000000000004","email":"scanner@ticklo.test","name":"Bilal Ahmed"},
    {"id":"00000000-0000-4000-8000-000000000005","email":"member@ticklo.test","name":"Sara Malik"}
  ]';
  v_u jsonb;
begin
  for v_u in select * from jsonb_array_elements(v_users) loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', (v_u ->> 'id')::uuid, 'authenticated', 'authenticated',
      v_u ->> 'email', extensions.crypt('TickLO@12345', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_u ->> 'name'),
      now(), now(), '', '', '', ''
    ) on conflict (id) do nothing;

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), (v_u ->> 'id')::uuid, v_u ->> 'id',
      jsonb_build_object('sub', v_u ->> 'id', 'email', v_u ->> 'email', 'email_verified', true),
      'email', now(), now(), now()
    ) on conflict do nothing;
  end loop;
end;
$$;

update public.profiles set is_admin = true, phone = '+923000000001'
  where id = '00000000-0000-4000-8000-000000000001';
update public.profiles set phone = '+923000000002', university_id = '10000000-0000-4000-8000-000000000001'
  where id = '00000000-0000-4000-8000-000000000002';
update public.profiles set phone = '+923000000003', university_id = '10000000-0000-4000-8000-000000000001'
  where id = '00000000-0000-4000-8000-000000000003';
update public.profiles set phone = '+923000000004', university_id = '10000000-0000-4000-8000-000000000001'
  where id = '00000000-0000-4000-8000-000000000004';
update public.profiles set phone = '+923000000005', university_id = '10000000-0000-4000-8000-000000000002'
  where id = '00000000-0000-4000-8000-000000000005';

-- ---------------------------------------------------------------------------
-- Societies
-- ---------------------------------------------------------------------------
insert into public.organizations (id, slug, name, university_id, type, about, social_links, status, reviewed_by, reviewed_at, created_by)
values
  ('20000000-0000-4000-8000-000000000001', 'lums-music-society', 'LUMS Music Society',
   '10000000-0000-4000-8000-000000000001', 'society',
   'The official music society of LUMS. Concerts, open mics and jam sessions all year round.',
   '{"instagram":"https://instagram.com/lumsmusic","facebook":"https://facebook.com/lumsmusic"}',
   'approved', '00000000-0000-4000-8000-000000000001', now(), '00000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000002', 'nust-drama-club', 'NUST Drama Club',
   '10000000-0000-4000-8000-000000000002', 'society',
   'Theatre, improv and the annual NUST drama festival.',
   '{"instagram":"https://instagram.com/nustdrama"}',
   'pending', null, null, '00000000-0000-4000-8000-000000000005')
on conflict do nothing;

insert into public.organization_members (org_id, user_id, role) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'owner'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', 'member'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 'scanner'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005', 'owner')
on conflict do nothing;

insert into public.payment_accounts (id, org_id, kind, bank_name, account_title, account_number, iban) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'bank', 'Meezan Bank',
   'LUMS Music Society', '0211-0105678901', 'PK36MEZN0002110105678901'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'jazzcash', null,
   'Ayesha Khan', '03001234567', null)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Events (dates are relative to "now" so the seed never goes stale)
-- ---------------------------------------------------------------------------
insert into public.events (
  id, org_id, slug, name, description, venue, starts_at, ends_at, capacity, visibility,
  max_tickets_per_order, status, submitted_at, reviewed_by, reviewed_at, published_at, created_by
) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'winter-gala-2026',
   'Winter Gala 2026',
   'The biggest night of the semester: live bands, food stalls and a surprise headliner. Gates open at 5:30 PM.',
   'LUMS Sports Complex, DHA Lahore',
   (date_trunc('day', now() at time zone 'Asia/Karachi') + interval '14 days 18 hours') at time zone 'Asia/Karachi',
   (date_trunc('day', now() at time zone 'Asia/Karachi') + interval '14 days 23 hours') at time zone 'Asia/Karachi',
   300, 'public', 5, 'published', now(), '00000000-0000-4000-8000-000000000001', now(), now(),
   '00000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'acoustic-night',
   'Acoustic Night',
   'An intimate unplugged evening with student artists.',
   'LUMS Amphitheatre',
   (date_trunc('day', now() at time zone 'Asia/Karachi') + interval '21 days 19 hours') at time zone 'Asia/Karachi',
   (date_trunc('day', now() at time zone 'Asia/Karachi') + interval '21 days 22 hours') at time zone 'Asia/Karachi',
   120, 'public', 4, 'pending_review', now(), null, null, null,
   '00000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'autumn-jam-2026',
   'Autumn Jam 2026',
   'Open-air jam session to welcome the new batch.',
   'LUMS Main Lawn',
   (date_trunc('day', now() at time zone 'Asia/Karachi') - interval '30 days' + interval '17 hours') at time zone 'Asia/Karachi',
   (date_trunc('day', now() at time zone 'Asia/Karachi') - interval '30 days' + interval '21 hours') at time zone 'Asia/Karachi',
   200, 'public', 5, 'published', now() - interval '45 days', '00000000-0000-4000-8000-000000000001',
   now() - interval '44 days', now() - interval '44 days', '00000000-0000-4000-8000-000000000002')
on conflict do nothing;

insert into public.ticket_types (id, event_id, name, description, price_paisa, quantity, requires_student_card, sort_order) values
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'General (Free)',
   'Free entry, standing area.', 0, 100, false, 1),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'Student Pass',
   'Discounted pass for university students. Show your student card at the gate.', 80000, 80, true, 2),
  ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', 'VIP',
   'Front-row seating and a free drink.', 250000, 120, false, 3),
  ('50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000002', 'Standard',
   null, 50000, 120, false, 1),
  ('50000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000003', 'General',
   null, 50000, 200, false, 1)
on conflict do nothing;

insert into public.event_payment_accounts (event_id, payment_account_id) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- Scanner for the Winter Gala (expires 6 h after the event ends)
insert into public.event_staff (event_id, user_id, role, assigned_by, expires_at)
select e.id, '00000000-0000-4000-8000-000000000004', 'scanner', '00000000-0000-4000-8000-000000000002',
       e.ends_at + interval '6 hours'
from public.events e where e.id = '40000000-0000-4000-8000-000000000001'
on conflict do nothing;
