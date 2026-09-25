-- Lyceum Placements — Placement Management System
-- Copyright © Bhanu Mendis - LGH IT
--
-- v6.1 — migration history, the write path and optimistic concurrency. Idempotent.
--
-- Until v5 the browser saved every record with an upsert (INSERT … ON CONFLICT DO UPDATE).
-- Postgres checks the INSERT policy, the SELECT policy and the BEFORE INSERT triggers for an
-- upsert even when the row already exists, so on a real project a counsellor or student
-- could not write an audit row, a student could not save their own case and nobody but the
-- administrator could edit their own profile. From v6 the client inserts new rows and
-- PATCHes existing ones; nothing in this file loosens a policy to make upserts work.
--
-- Concurrency: every case carries a revision. An update must present exactly the stored
-- revision plus one, otherwise it is refused with HTTP 409 (SQLSTATE PT409) and the writer
-- reloads. Two counsellors editing the same case can no longer overwrite each other.

-- ---------------------------------------------------------------------------
-- Migration history
-- ---------------------------------------------------------------------------

create table if not exists public.schema_migrations (
  version    text primary key,
  name       text not null,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;
comment on table public.schema_migrations is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. Applied schema migrations; data migrations run once, keyed by version.';

-- A project reaching v6 has necessarily run the v4 base and the v5 additions.
insert into public.schema_migrations (version, name) values
  ('20260901000000', 'v4_base'),
  ('20260912000000', 'v5_notifications_audit')
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------
-- The organisation row always exists, so saving settings is an UPDATE under org_update
-- and never needs the insert policy.
-- ---------------------------------------------------------------------------

insert into public.org_config (id, config) values ('org', '{}'::jsonb) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Cases: columns derived from the document, revision guard, server time
-- ---------------------------------------------------------------------------

-- The columns that row-level security reads (counsellor_id, student_user_id) and the status
-- are copied from the case document rather than trusted from the payload, so the two can
-- never disagree: a caller cannot point student_user_id at another student while the
-- document says otherwise. RLS WITH CHECK runs after BEFORE triggers, so the policies judge
-- the derived values. Runs before cases_guard (trigger names fire in alphabetical order).
create or replace function public.case_derive() returns trigger
  language plpgsql set search_path = public as $$
begin
  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    raise exception 'A case must be a JSON object' using errcode = 'P0001';
  end if;
  if new.data ->> 'id' is distinct from new.id or new.data ->> 'ref' is distinct from new.ref then
    raise exception 'Case identity in the document does not match the record' using errcode = 'P0001';
  end if;
  new.counsellor_id   := nullif(new.data ->> 'counsellorId', '');
  new.student_user_id := nullif(new.data ->> 'studentUserId', '');
  new.status          := coalesce(nullif(new.data ->> 'status', ''), 'open');
  if new.status not in ('open', 'hold', 'deferred', 'exited', 'completed') then
    raise exception 'Unknown case status %', new.status using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    new.rev := 1;
  elsif public.is_system_caller() then
    -- Maintenance jobs and the SQL editor still move the revision, so an open browser copy
    -- of the case is recognised as stale.
    if new.rev is not distinct from old.rev then new.rev := old.rev + 1; end if;
  elsif new.rev is distinct from old.rev + 1 then
    raise exception 'This case was changed by someone else while you were working on it. Your change was not saved; reload to see the latest version.'
      using errcode = 'PT409', hint = 'stale_revision';
  end if;

  new.updated_at := now();
  new.data := jsonb_set(new.data, '{rev}', to_jsonb(new.rev));
  return new;
end $$;

drop trigger if exists cases_derive on public.cases;
create trigger cases_derive before insert or update on public.cases for each row execute function public.case_derive();

-- Saving a case. A PATCH that row-level security filters out matches nothing and still
-- answers 204, which would let a counsellor who was unassigned mid-edit believe their work
-- was saved. The function reports that case instead. It runs with the caller's rights, so
-- the policies, the guard and the revision check above decide exactly as for a PATCH.
create or replace function public.save_case(p_id text, p_rev integer, p_data jsonb) returns integer
  language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  update public.cases set rev = p_rev, data = p_data where id = p_id;
  get diagnostics n = row_count;
  if n = 0 then
    if exists (select 1 from public.cases where id = p_id) then
      raise exception 'You can no longer change this case. Ask a Team Leader to check the assignment.' using errcode = 'PT403';
    end if;
    raise exception 'This case no longer exists, or you can no longer see it.' using errcode = 'PT404';
  end if;
  return p_rev;
end $$;
revoke all on function public.save_case(text, integer, jsonb) from public, anon;
grant execute on function public.save_case(text, integer, jsonb) to authenticated;

insert into public.schema_migrations (version, name) values ('20260925000100', 'v6_write_path') on conflict (version) do nothing;
