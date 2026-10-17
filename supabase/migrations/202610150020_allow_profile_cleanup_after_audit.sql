-- Audit records must survive a removed Auth user without preventing a
-- transactional signup rollback or test-account cleanup.
alter table public.audit_log drop constraint audit_log_actor_id_fkey;
alter table public.audit_log add constraint audit_log_actor_id_fkey
  foreign key (actor_id) references public.profiles(id) on delete set null;
