-- Defense in depth for an already-private mapping table.
-- Direct access stays revoked; only explicitly privileged server/database work may use it.
alter table private.auth_identity_map enable row level security;
