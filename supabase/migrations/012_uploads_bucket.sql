-- A single public storage bucket for images the app displays: auction
-- images today, event photographs later (same "committee uploads, everyone
-- can view" shape - see /api/uploads). Objects are organized by folder
-- prefix, e.g. "auctions/<uuid>.jpg", and later "events/<eventId>/photos/<uuid>.jpg".
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

-- No storage.objects policies needed. The bucket's public flag makes every
-- object publicly READABLE with no policy required. Every WRITE goes through
-- /api/uploads using the service-role client, which bypasses storage RLS the
-- same way it bypasses every other table's RLS in this app (see the
-- auctions/auction_registrations/auction_bids migrations for the identical
-- reasoning: this app has no Supabase Auth session in the browser, so a
-- storage policy keyed on auth.uid() would be as unreachable as a table
-- policy would be). Do not add anon/authenticated storage policies expecting
-- a direct browser supabase.storage.from("uploads").upload(...) call to work.
