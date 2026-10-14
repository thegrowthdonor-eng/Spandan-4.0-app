-- Phase 5: editable, scheduled public promotional content.
-- All assets are committee-curated references; no student upload workflow or commerce tables exist.

create type public.content_state as enum ('draft', 'scheduled', 'published', 'archived');

create table public.content_banners (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  subtitle text check (char_length(subtitle) <= 400),
  image_url text not null check (image_url ~ '^https://'),
  image_alt text not null check (char_length(btrim(image_alt)) between 1 and 300),
  link_url text check (link_url ~ '^https?://|^/'),
  sort_order integer not null default 0,
  visible boolean not null default true,
  state public.content_state not null default 'draft',
  publish_at timestamptz,
  unpublish_at timestamptz,
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (unpublish_at is null or publish_at is null or unpublish_at > publish_at)
);

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  tier text not null check (char_length(btrim(tier)) between 1 and 80),
  logo_url text not null check (logo_url ~ '^https://'),
  logo_alt text not null check (char_length(btrim(logo_alt)) between 1 and 300),
  description text check (char_length(description) <= 1000),
  website_url text check (website_url ~ '^https://'),
  sort_order integer not null default 0,
  state public.content_state not null default 'draft',
  publish_at timestamptz,
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media_items (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  kind text not null check (kind in ('image', 'video_link', 'audio_link', 'anthem', 'aftermovie', 'teaser')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  asset_url text not null check (asset_url ~ '^https://'),
  thumbnail_url text check (thumbnail_url ~ '^https://'),
  alt_text text not null check (char_length(btrim(alt_text)) between 1 and 300),
  caption text check (char_length(caption) <= 1000),
  rights_note text not null check (char_length(btrim(rights_note)) between 1 and 1000),
  state public.content_state not null default 'draft',
  publish_at timestamptz,
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stage_reveals (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  artist_name text not null check (char_length(btrim(artist_name)) between 1 and 160),
  description text check (char_length(description) <= 1000),
  image_url text check (image_url ~ '^https://'),
  image_alt text not null default 'Stage reveal artwork' check (char_length(btrim(image_alt)) between 1 and 300),
  stage_at timestamptz,
  reveal_at timestamptz not null,
  state public.content_state not null default 'draft',
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organiser_profiles (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  photo_url text check (photo_url ~ '^https://'),
  photo_alt text check (char_length(photo_alt) <= 300),
  public_contact text check (char_length(public_contact) <= 200),
  contact_approved boolean not null default false,
  sort_order integer not null default 0,
  state public.content_state not null default 'draft',
  publish_at timestamptz,
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contact_approved or public_contact is null)
);

create table public.merchandise_items (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text not null check (char_length(btrim(description)) between 1 and 2000),
  image_url text not null check (image_url ~ '^https://'),
  image_alt text not null check (char_length(btrim(image_alt)) between 1 and 300),
  sizes text[] not null default '{}',
  availability_note text not null check (char_length(btrim(availability_note)) between 1 and 500),
  collection_note text not null check (char_length(btrim(collection_note)) between 1 and 1000),
  contact_note text not null check (char_length(btrim(contact_note)) between 1 and 500),
  state public.content_state not null default 'draft',
  publish_at timestamptz,
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger content_banners_touch_updated_at before update on public.content_banners for each row execute function public.touch_updated_at();
create trigger sponsors_touch_updated_at before update on public.sponsors for each row execute function public.touch_updated_at();
create trigger media_items_touch_updated_at before update on public.media_items for each row execute function public.touch_updated_at();
create trigger stage_reveals_touch_updated_at before update on public.stage_reveals for each row execute function public.touch_updated_at();
create trigger organiser_profiles_touch_updated_at before update on public.organiser_profiles for each row execute function public.touch_updated_at();
create trigger merchandise_items_touch_updated_at before update on public.merchandise_items for each row execute function public.touch_updated_at();

alter table public.content_banners enable row level security;
alter table public.sponsors enable row level security;
alter table public.media_items enable row level security;
alter table public.stage_reveals enable row level security;
alter table public.organiser_profiles enable row level security;
alter table public.merchandise_items enable row level security;

create policy public_banners_read on public.content_banners for select using (visible and state in ('published', 'scheduled') and (publish_at is null or publish_at <= now()) and (unpublish_at is null or unpublish_at > now()));
create policy public_sponsors_read on public.sponsors for select using (state in ('published', 'scheduled') and (publish_at is null or publish_at <= now()));
create policy public_media_read on public.media_items for select using (state in ('published', 'scheduled') and (publish_at is null or publish_at <= now()));
create policy public_stage_reveals_read on public.stage_reveals for select using (state in ('published', 'scheduled') and reveal_at <= now());
create policy public_organisers_read on public.organiser_profiles for select using (state in ('published', 'scheduled') and (publish_at is null or publish_at <= now()));
create policy public_merchandise_read on public.merchandise_items for select using (state in ('published', 'scheduled') and (publish_at is null or publish_at <= now()));
