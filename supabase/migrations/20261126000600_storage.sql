-- =============================================================================
-- TickLO v1 – Storage buckets and policies
--   public : posters, logos, avatars
--   private: payment-proofs, student-cards, org-proofs   (NFR-15)
-- The web app uploads through server actions (service role), but these
-- policies let a future Flutter app upload/read directly and safely.
-- Path conventions:
--   posters/{org_id}/{file}            logos/{org_id|user_id}/{file}
--   avatars/{user_id}/{file}
--   payment-proofs/{event_id}/{order_id}/{file}
--   student-cards/{event_id}/{order_id}/{file}
--   org-proofs/{user_id}/{file}
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('posters', 'posters', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('logos', 'logos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('student-cards', 'student-cards', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('org-proofs', 'org-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public images: anyone can read
create policy "ticklo_public_images_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('posters', 'logos', 'avatars'));

-- Posters: organizers of the society in the first folder
create policy "ticklo_posters_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'posters' and public.is_org_staff(public.try_uuid((storage.foldername(name))[1])));
create policy "ticklo_posters_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'posters' and public.is_org_staff(public.try_uuid((storage.foldername(name))[1])));
create policy "ticklo_posters_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'posters' and public.is_org_staff(public.try_uuid((storage.foldername(name))[1])));

-- Logos: the user's own folder (before the society exists) or an org they run
create policy "ticklo_logos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_org_staff(public.try_uuid((storage.foldername(name))[1]))
    )
  );
create policy "ticklo_logos_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_org_staff(public.try_uuid((storage.foldername(name))[1]))
    )
  );

-- Avatars: own folder only
create policy "ticklo_avatars_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ticklo_avatars_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Payment screenshots + student cards: buyer, the event's organizers, admins
create policy "ticklo_payment_files_read" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('payment-proofs', 'student-cards') and (
      public.is_admin()
      or public.is_event_staff(public.try_uuid((storage.foldername(name))[1]))
      or exists (
        select 1 from public.orders o
        where o.id = public.try_uuid((storage.foldername(name))[2]) and o.user_id = auth.uid()
      )
    )
  );
create policy "ticklo_payment_files_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('payment-proofs', 'student-cards') and exists (
      select 1 from public.orders o
      where o.id = public.try_uuid((storage.foldername(name))[2])
        and o.event_id = public.try_uuid((storage.foldername(name))[1])
        and o.user_id = auth.uid()
        and o.status in ('awaiting_payment', 'rejected')
    )
  );

-- Society proof documents: the uploader and admins
create policy "ticklo_org_proofs_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'org-proofs' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
create policy "ticklo_org_proofs_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'org-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
