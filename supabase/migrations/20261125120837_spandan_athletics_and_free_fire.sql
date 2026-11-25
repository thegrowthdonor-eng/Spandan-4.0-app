-- Official Spandan 4.0 catalogue additions. Use the edition-wide registration window.
with festival as (
  select id, registration_opens_at, registration_closes_at
  from public.editions
  where name = 'SPANDAN 4.0' and starts_on = date '2026-12-03' and status <> 'archived'
), athletics(slug, title, summary, rules) as (
  values
    ('100m-sprint', '100 m Sprint', 'A straight-track sprint over 100 metres.',
      E'- Start on the official signal.\n- Stay in your assigned lane.\n- Fastest valid time wins.'),
    ('200m-sprint', '200 m Sprint', 'A sprint through the bend and down the straight.',
      E'- Start on the official signal.\n- Stay in your assigned lane.\n- Fastest valid time wins.'),
    ('400m-sprint', '400 m Sprint', 'A one-lap sprint around the track.',
      E'- Start on the official signal.\n- Stay in your assigned lane.\n- Fastest valid time wins.'),
    ('4x100m-relay', '4×100 m Relay', 'A baton relay with four runners covering 100 metres each.',
      E'- Four runners are required to start the race.\n- Pass the baton inside the marked exchange zone.\n- Stay in your assigned lane.'),
    ('shot-put', 'Shot Put', 'Put the shot for distance.',
      E'- Push the shot from the shoulder.\n- Follow the circle boundaries and land in the marked sector.\n- Longest valid put wins.'),
    ('discus-throw', 'Discus Throw', 'Throw the discus for distance.',
      E'- Wait for the official’s signal.\n- The discus must land in the marked sector.\n- Longest valid throw wins.'),
    ('javelin-throw', 'Javelin Throw', 'Throw the javelin for distance.',
      E'- Attempt only on the official’s signal.\n- Stay behind the foul line and land in the marked sector.\n- Longest valid throw wins.'),
    ('long-jump', 'Long Jump', 'Jump for distance into the landing pit.',
      E'- Take off without crossing the foul line.\n- Land in the pit.\n- Longest valid jump wins.'),
    ('high-jump', 'High Jump', 'Clear the highest bar you can.',
      E'- Take off from one foot.\n- Clear the bar without dislodging it.\n- Highest valid clearance wins.')
), additions as (
  select slug, title, summary, rules, 'sport'::public.event_category as category,
    'Dau Dayal Stadium, ASMC Firozabad' as venue,
    '2026-12-03 11:00:00+05:30'::timestamptz as starts_at,
    '2026-12-05 17:00:00+05:30'::timestamptz as ends_at,
    'programme' as operating_method, '{"division":"open","sub_category":"athletics"}'::jsonb as eligibility,
    1 as min_size, 4 as max_size, false as batch_restricted
  from athletics
  union all
  select 'free-fire', 'Free Fire', 'An online Battle Royale tournament for four-player squads.',
    E'- Play with your four registered squad members and registered in-game IDs.\n- Follow the organiser’s lobby and check-in instructions.\n- Cheats, exploits and teaming with rival squads are prohibited.',
    'other'::public.event_category, 'Online', '2026-12-04 22:00:00+05:30'::timestamptz, '2026-12-06 23:30:00+05:30'::timestamptz,
    'results_only', '{"division":"open"}'::jsonb, 4, 4, true
)
insert into public.events (
  edition_id, slug, title, summary, rules_markdown, category, venue, starts_at, ends_at,
  application_opens_at, application_closes_at, state, registration_enabled, operating_method,
  eligibility, format, group_min_size, group_max_size, batch_restricted, application_questions
)
select festival.id, additions.slug, additions.title, additions.summary, additions.rules, additions.category,
  additions.venue, additions.starts_at, additions.ends_at, festival.registration_opens_at, festival.registration_closes_at,
  'open', true, additions.operating_method, additions.eligibility, 'group', additions.min_size,
  additions.max_size, additions.batch_restricted,
  case when additions.slug = 'free-fire' then
    '[{"key":"free_fire_uid","label":"Free Fire in-game ID","type":"text","required":true}]'::jsonb
    else '[]'::jsonb end
from festival cross join additions
on conflict (edition_id, slug) do nothing;
