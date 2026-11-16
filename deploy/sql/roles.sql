-- Database roles for the VPS. Run as the postgres superuser, twice: once BEFORE `pnpm db:migrate`, once AFTER it (the second run grants munaja_app).
-- Idempotent. No password here: the runbook sets passwords from psql variables (-v owner_pw=... -v app_pw=...), which
-- come from files on the server and never appear in this repo, in chat, or in shell history.
--
--   munaja_owner  owns the database and runs `pnpm db:migrate`. Not a superuser, cannot create roles.
--   anon, authenticated, service_role
--                 The roles the migrations grant to. Made here, by the superuser, because service_role needs BYPASSRLS
--                 and only a superuser may give that. The bootstrap file then finds them and skips its own create.
--   munaja_app    what the running app and worker use (DATABASE_URL). Not a superuser, cannot create anything.
--                 It can only SET ROLE to authenticated / service_role, which hold the table privileges the
--                 migrations grant. Nothing is granted to it directly.
\set ON_ERROR_STOP on

select 'create role munaja_owner login nosuperuser nocreatedb nocreaterole'
where not exists (select 1 from pg_roles where rolname = 'munaja_owner') \gexec
select 'create role munaja_app login nosuperuser nocreatedb nocreaterole noinherit'
where not exists (select 1 from pg_roles where rolname = 'munaja_app') \gexec

select format('create role %I nologin%s', r.n, r.extra)
from (values ('anon', ''), ('authenticated', ''), ('service_role', ' bypassrls')) as r(n, extra)
where not exists (select 1 from pg_roles where rolname = r.n) \gexec

-- Passwords: only when given, so a second run without them leaves the current ones alone.
\if :{?owner_pw}
alter role munaja_owner password :'owner_pw';
\endif
\if :{?app_pw}
alter role munaja_app password :'app_pw';
\endif

select 'create database munaja owner munaja_owner encoding ''UTF8'' template template0'
where not exists (select 1 from pg_database where datname = 'munaja') \gexec

revoke all on database munaja from public;
grant connect on database munaja to munaja_app, munaja_owner;

-- Second run (after migrate): let the app switch to the two roles the code uses. Skipped while they do not exist yet.
select format('grant %I to munaja_app', r)
from unnest(array['authenticated', 'service_role']) as r
where exists (select 1 from pg_roles where rolname = r) \gexec
