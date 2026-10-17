-- Polls and engagement:
-- 1. Policy for students to read their own votes.
-- 2. get_active_polls RPC returning poll question, options, vote counts, and user's vote.
-- 3. create_admin_poll RPC for Main Admin poll administration.

create policy poll_votes_read_own on public.poll_votes
  for select to authenticated
  using (profile_id = auth.uid());

-- Function for students to load published polls with their own vote status
create or replace function public.get_active_polls(p_edition_id uuid)
returns table (
  poll_id uuid,
  question text,
  opens_at timestamptz,
  closes_at timestamptz,
  is_open boolean,
  show_totals boolean,
  user_voted_option_id uuid,
  options jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  return query
    select
      p.id,
      p.question,
      p.opens_at,
      p.closes_at,
      (now() >= p.opens_at and now() < p.closes_at) as is_open,
      (p.show_totals_before_close or now() >= p.closes_at) as show_totals,
      uv.option_id as user_voted_option_id,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', po.id,
            'label', po.label,
            'sort_order', po.sort_order,
            'vote_count', case when (p.show_totals_before_close or now() >= p.closes_at)
                               then coalesce(vc.cnt, 0)
                               else null end
          ) order by po.sort_order
        ) filter (where po.id is not null),
        '[]'::jsonb
      ) as options
    from public.polls p
    left join public.poll_votes uv on uv.poll_id = p.id and uv.profile_id = auth.uid()
    left join public.poll_options po on po.poll_id = p.id
    left join lateral (
      select count(*) as cnt from public.poll_votes pv where pv.option_id = po.id
    ) vc on true
    where p.edition_id = p_edition_id
      and p.published_at is not null
      and p.published_at <= now()
    group by p.id, p.question, p.opens_at, p.closes_at, p.show_totals_before_close, uv.option_id
    order by p.opens_at desc;
end;
$$;
revoke all on function public.get_active_polls(uuid) from public, anon;
grant execute on function public.get_active_polls(uuid) to authenticated;

-- Admin function to create and publish a festival poll
create or replace function public.create_admin_poll(
  p_edition_id uuid,
  p_question text,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_options text[],
  p_show_totals boolean default false
)
returns public.polls
language plpgsql security definer set search_path = public as $$
declare
  new_poll public.polls;
  opt_label text;
  order_idx integer := 0;
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if coalesce(nullif(btrim(p_question), ''), '') = '' then
    raise exception 'Poll question is required' using errcode = '22023';
  end if;
  if p_closes_at <= p_opens_at then
    raise exception 'Poll close time must be after open time' using errcode = '22023';
  end if;
  if p_options is null or array_length(p_options, 1) < 2 then
    raise exception 'At least two options are required' using errcode = '22023';
  end if;

  insert into public.polls (edition_id, question, opens_at, closes_at, show_totals_before_close, published_at, created_by)
  values (p_edition_id, btrim(p_question), p_opens_at, p_closes_at, coalesce(p_show_totals, false), now(), auth.uid())
  returning * into new_poll;

  foreach opt_label in array p_options loop
    if coalesce(nullif(btrim(opt_label), ''), '') <> '' then
      insert into public.poll_options (poll_id, label, sort_order)
      values (new_poll.id, btrim(opt_label), order_idx);
      order_idx := order_idx + 1;
    end if;
  end loop;

  insert into public.audit_log (actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'poll.created', 'poll', new_poll.id, jsonb_build_object('question', new_poll.question));

  return new_poll;
end;
$$;
revoke all on function public.create_admin_poll(uuid, text, timestamptz, timestamptz, text[], boolean) from public, anon;
grant execute on function public.create_admin_poll(uuid, text, timestamptz, timestamptz, text[], boolean) to authenticated;
