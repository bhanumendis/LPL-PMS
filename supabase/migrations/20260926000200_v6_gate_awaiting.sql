-- Lyceum Placements — Placement Management System
-- Copyright © Bhanu Mendis - LGH IT
--
-- v6.7 — "awaiting decision" counts what the approval queue lists. Idempotent.
--
-- public.gate_stats reported as pending every gate submission still marked pending: those on
-- cases on hold, deferred, exited or completed, and earlier rounds, as well as the ones a Team
-- Leader can act on. The Approvals page headed its queue with that number (118 over a queue of
-- 43 in the test data) and promised rows that "Load more" could never reach. Pending now means
-- what the queue, the dock badge and the dashboard mean: open cases whose latest submission of
-- a gate is pending (the partial index cases_gate_queue_idx holds exactly these), and the
-- oldest is the earliest of those submissions. Decisions, approvals, first-round approvals and
-- turnaround still count every submission in the gate register.

create or replace function public.gate_stats_compute() returns jsonb
  language sql stable security invoker set search_path = public set jit = off as $$
  with awaiting as (
    select count(*) as n, min(c.gate_pending_at) as oldest
      from public.cases c
     where c.status = 'open' and c.gate_pending is not null
  ), register as (
    select count(*) filter (where status in ('approved', 'returned')) as decided,
           count(*) filter (where status = 'approved') as approved,
           count(*) filter (where status = 'approved' and round = 1) as first_round,
           -- Mean days from submission to decision, to one decimal (as the page showed it).
           round((avg(extract(epoch from (coalesce(decided_at, submitted_at) - submitted_at)) / 86400)
                  filter (where status in ('approved', 'returned') and submitted_at is not null))::numeric, 1) as turnaround
      from public.case_gates
  )
  select jsonb_build_object(
    'pending', a.n,
    'oldestPendingAt', a.oldest,
    'decided', r.decided,
    'approved', r.approved,
    'firstRoundApproved', r.first_round,
    'avgTurnaroundDays', r.turnaround)
  from awaiting a, register r
$$;

-- The shared answer was computed with the old meaning; the next read recomputes it.
delete from public.dashboard_cache where scope = 'gates';

insert into public.schema_migrations (version, name) values ('20260926000200', 'v6_gate_awaiting') on conflict (version) do nothing;
