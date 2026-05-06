-- 025: Profile pictures for creators and brands
-- Stores the public URL of uploaded profile images.

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS profile_image_url text;

ALTER TABLE public.brand_profiles
  ADD COLUMN IF NOT EXISTS profile_image_url text;
