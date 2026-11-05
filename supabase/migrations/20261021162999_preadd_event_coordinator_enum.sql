-- PostgreSQL makes a newly added enum value usable only after this migration
-- commits. Keep this immediately before the coordinator migration so a blank
-- project can replay the chain without an unsafe-use-of-new-value error.
alter type public.staff_role add value if not exists 'event_coordinator';
