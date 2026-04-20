-- Activity: activity event logging and triggers.
-- Canonical greenfield owner file. Modify in place.

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  card_id uuid references public.cards (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  event_action text not null,
  title text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists activity_events_card_id_idx
  on public.activity_events (card_id, created_at desc);

alter table public.activity_events enable row level security;

create policy activity_events_select on public.activity_events
  for select using (public.can_access_project(project_id, auth.uid()));

create policy activity_events_insert on public.activity_events
  for insert with check (public.can_access_project(project_id, auth.uid()));

create or replace function public.get_card_activity(target_card_id uuid)
returns table (
  id uuid,
  card_id uuid,
  actor_id uuid,
  actor_name text,
  event_type text,
  event_action text,
  title text,
  metadata jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ae.id,
    ae.card_id,
    ae.actor_id,
    coalesce(profile.full_name, split_part(profile.email, '@', 1), 'System') as actor_name,
    ae.event_type,
    ae.event_action,
    ae.title,
    ae.metadata,
    ae.created_at
  from public.activity_events ae
  left join public.profiles profile on profile.user_id = ae.actor_id
  where ae.card_id = target_card_id
  order by ae.created_at desc
  limit 100;
$$;

revoke all on function public.get_card_activity(uuid) from public;

grant execute on function public.get_card_activity(uuid) to authenticated;

create or replace function public.log_card_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := coalesce(NEW.updated_by_user_id, NEW.created_by_user_id);
  automation_metadata jsonb := public.current_automation_metadata();
begin
  if TG_OP = 'INSERT' then
    insert into public.activity_events (project_id, card_id, actor_id, event_type, event_action, title, metadata)
    values (
      NEW.project_id,
      NEW.id,
      actor,
      'card',
      'created',
      'Task created',
      jsonb_build_object('cardTitle', NEW.title) || automation_metadata
    );
    return NEW;
  end if;

  if OLD.status_option_id is distinct from NEW.status_option_id then
    insert into public.activity_events (project_id, card_id, actor_id, event_type, event_action, title, metadata)
    values (
      NEW.project_id,
      NEW.id,
      actor,
      'card',
      case
        when (select category from public.project_status_options where id = NEW.status_option_id) = 'completed' then 'completed'
        when (select category from public.project_status_options where id = OLD.status_option_id) = 'completed' then 'reopened'
        else 'updated'
      end,
      case
        when (select category from public.project_status_options where id = NEW.status_option_id) = 'completed' then 'Task completed'
        when (select category from public.project_status_options where id = OLD.status_option_id) = 'completed' then 'Task reopened'
        else 'Status changed'
      end,
      jsonb_build_object(
        'field',
        'status_option_id',
        'oldValue',
        OLD.status_option_id::text,
        'newValue',
        NEW.status_option_id::text
      ) || automation_metadata
    );
  end if;

  if OLD.title <> NEW.title then
    insert into public.activity_events (project_id, card_id, actor_id, event_type, event_action, title, metadata)
    values (
      NEW.project_id,
      NEW.id,
      actor,
      'card',
      'updated',
      'Title changed',
      jsonb_build_object('field', 'title', 'oldValue', OLD.title, 'newValue', NEW.title) || automation_metadata
    );
  end if;

  if OLD.priority_option_id is distinct from NEW.priority_option_id then
    insert into public.activity_events (project_id, card_id, actor_id, event_type, event_action, title, metadata)
    values (
      NEW.project_id,
      NEW.id,
      actor,
      'card',
      'updated',
      'Priority changed',
      jsonb_build_object(
        'field',
        'priority_option_id',
        'oldValue',
        OLD.priority_option_id::text,
        'newValue',
        NEW.priority_option_id::text
      ) || automation_metadata
    );
  end if;

  if coalesce(OLD.assignee_user_id::text, '') <> coalesce(NEW.assignee_user_id::text, '') then
    insert into public.activity_events (project_id, card_id, actor_id, event_type, event_action, title, metadata)
    values (
      NEW.project_id,
      NEW.id,
      actor,
      'assignment',
      case when NEW.assignee_user_id is null then 'unassigned' else 'assigned' end,
      case when NEW.assignee_user_id is null then 'Assignee removed' else 'Task assigned' end,
      jsonb_build_object(
        'field',
        'assignee',
        'oldValue',
        OLD.assignee_user_id,
        'newValue',
        NEW.assignee_user_id
      ) || automation_metadata
    );
  end if;

  if coalesce(OLD.due_at::text, '') <> coalesce(NEW.due_at::text, '') then
    insert into public.activity_events (project_id, card_id, actor_id, event_type, event_action, title, metadata)
    values (
      NEW.project_id,
      NEW.id,
      actor,
      'card',
      'updated',
      'Due date changed',
      jsonb_build_object('field', 'due_date', 'oldValue', OLD.due_at, 'newValue', NEW.due_at) || automation_metadata
    );
  end if;

  if coalesce(OLD.start_at::text, '') <> coalesce(NEW.start_at::text, '') then
    insert into public.activity_events (project_id, card_id, actor_id, event_type, event_action, title, metadata)
    values (
      NEW.project_id,
      NEW.id,
      actor,
      'card',
      'updated',
      'Start date changed',
      jsonb_build_object('field', 'start_date', 'oldValue', OLD.start_at, 'newValue', NEW.start_at) || automation_metadata
    );
  end if;

  if coalesce(OLD.effort, -1) <> coalesce(NEW.effort, -1) then
    insert into public.activity_events (project_id, card_id, actor_id, event_type, event_action, title, metadata)
    values (
      NEW.project_id,
      NEW.id,
      actor,
      'card',
      'updated',
      'Effort changed',
      jsonb_build_object('field', 'effort', 'oldValue', OLD.effort, 'newValue', NEW.effort) || automation_metadata
    );
  end if;

  return NEW;
end;
$$;

create trigger trg_card_activity
  after insert or update on public.cards
  for each row execute function public.log_card_activity();

