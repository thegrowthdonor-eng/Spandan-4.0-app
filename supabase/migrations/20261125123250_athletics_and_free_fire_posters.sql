-- Publish after the matching WebP files are verified on the public media domain.
update public.events e
set poster_url = 'https://media.auraserve.in/event-posters/spandan-4-pace-league/' || e.slug || '.webp'
from public.editions ed
where ed.id = e.edition_id and ed.name = 'SPANDAN 4.0'
  and ed.starts_on = date '2026-12-03' and ed.status <> 'archived'
  and e.poster_url is null
  and e.slug in (
    '100m-sprint', '200m-sprint', '400m-sprint', '4x100m-relay', 'shot-put',
    'discus-throw', 'javelin-throw', 'long-jump', 'high-jump', 'free-fire'
  );
