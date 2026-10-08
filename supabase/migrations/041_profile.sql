-- Apply manually. Independent of the others. Three optional columns, additive.
--
-- A profile a person can make their own.
--
--   custom_photo_url  A photograph they chose, uploaded through this app (folder
--                     `profiles`). `photo_url` keeps following the Google account on
--                     every sign-in, so a chosen photo needs its own column or the
--                     next request would overwrite it - the same reason `full_name`
--                     stopped being rewritten. NULL means "use Google's".
--   flat              Their household, so forms can start filled in. Not shown to
--                     anybody; it is a convenience for the person who typed it.
--   phone             Their number, for the same reason. PRIVATE: no route returns it
--                     to anyone but its owner, and it is only ever copied into a form
--                     the owner then submits.

alter table public.app_users
  add column if not exists custom_photo_url text check (custom_photo_url is null or char_length(custom_photo_url) <= 500),
  add column if not exists flat text check (flat is null or char_length(flat) <= 40),
  add column if not exists phone text check (phone is null or char_length(phone) <= 40);
