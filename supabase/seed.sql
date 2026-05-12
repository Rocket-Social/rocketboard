-- Local auth users
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  last_sign_in_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'demo@rocketboard.io',
    extensions.crypt('demo-password', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Demo User"}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'empty@rocketboard.io',
    extensions.crypt('demo-password', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Empty Access User"}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-4333-8333-333333333333',
    'authenticated',
    'authenticated',
    'sarah@rocketboard.io',
    extensions.crypt('demo-password', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Sarah Stone"}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '44444444-4444-4444-8444-444444444444',
    'authenticated',
    'authenticated',
    'alex@rocketboard.io',
    extensions.crypt('demo-password', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Alex Rivera"}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '55555555-5555-4555-8555-555555555555',
    'authenticated',
    'authenticated',
    'admin@rocketboard.dev',
    extensions.crypt('demo-password', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Admin User"}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  );

insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    '91111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    '{"sub":"11111111-1111-4111-8111-111111111111","email":"demo@rocketboard.io","email_verified":true}'::jsonb,
    'email',
    'demo@rocketboard.io',
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '92222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222',
    '{"sub":"22222222-2222-4222-8222-222222222222","email":"empty@rocketboard.io","email_verified":true}'::jsonb,
    'email',
    'empty@rocketboard.io',
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '93333333-3333-4333-8333-333333333333',
    '33333333-3333-4333-8333-333333333333',
    '{"sub":"33333333-3333-4333-8333-333333333333","email":"sarah@rocketboard.io","email_verified":true}'::jsonb,
    'email',
    'sarah@rocketboard.io',
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '94444444-4444-4444-8444-444444444444',
    '44444444-4444-4444-8444-444444444444',
    '{"sub":"44444444-4444-4444-8444-444444444444","email":"alex@rocketboard.io","email_verified":true}'::jsonb,
    'email',
    'alex@rocketboard.io',
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  ),
  (
    '95555555-5555-4555-8555-555555555555',
    '55555555-5555-4555-8555-555555555555',
    '{"sub":"55555555-5555-4555-8555-555555555555","email":"admin@rocketboard.dev","email_verified":true}'::jsonb,
    'email',
    'admin@rocketboard.dev',
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  );

insert into public.profiles (
  user_id,
  email,
  full_name,
  is_internal_admin
)
values
  ('11111111-1111-4111-8111-111111111111', 'demo@rocketboard.io', 'Demo User', false),
  ('22222222-2222-4222-8222-222222222222', 'empty@rocketboard.io', 'Empty Access User', false),
  ('33333333-3333-4333-8333-333333333333', 'sarah@rocketboard.io', 'Sarah Stone', false),
  ('44444444-4444-4444-8444-444444444444', 'alex@rocketboard.io', 'Alex Rivera', false),
  ('55555555-5555-4555-8555-555555555555', 'admin@rocketboard.dev', 'Admin User', true);

insert into public.organizations (
  id,
  name,
  slug,
  created_by_user_id
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Rocketboard Demo Org',
  'rocketboard-demo-org',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.workspaces (
  id,
  organization_id,
  name,
  slug,
  access,
  color_token,
  icon,
  created_by_user_id
)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Demo Workspace',
  'demo-workspace',
  'open',
  'blue',
  'M',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.workspace_members (
  workspace_id,
  user_id,
  role
)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'member'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '44444444-4444-4444-8444-444444444444', 'member');

insert into public.projects (
  id,
  workspace_id,
  name,
  slug,
  description,
  access,
  icon,
  position,
  project_key,
  next_card_number,
  builtin_field_labels,
  created_by_user_id,
  updated_by_user_id
)
values
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Product Team',
    'product-team',
    'Core product planning and execution board.',
    'open',
    '📋',
    0,
    'PT',
    4,
    '{"assignee":"Owner","effort":"Effort","priority":"Priority"}'::jsonb,
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Launch Ops',
    'launch-ops',
    'Private launch checklist for the next release.',
    'private',
    '🚀',
    1,
    'LO',
    2,
    '{}'::jsonb,
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111'
  );

insert into public.project_members (
  project_id,
  user_id,
  role
)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-3333-4333-8333-333333333333', 'member'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '44444444-4444-4444-8444-444444444444', 'member');

insert into public.project_views (
  id,
  project_id,
  name,
  view_type,
  position,
  is_default,
  shared_config,
  created_by_user_id,
  updated_by_user_id
)
values
  ('c1010101-0101-4101-8101-010101010101', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Overview', 'overview', 0, false, '{}'::jsonb, '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'),
  ('c2020202-0202-4202-8202-020202020202', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Table', 'table', 1, true, public.default_table_shared_config(), '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'),
  ('c3030303-0303-4303-8303-030303030303', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Kanban', 'kanban', 2, false, '{}'::jsonb, '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'),
  ('c4040404-0404-4404-8404-040404040404', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Document', 'document', 3, false, '{}'::jsonb, '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'),
  ('d1010101-0101-4101-8101-111111111111', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Overview', 'overview', 0, false, '{}'::jsonb, '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'),
  ('d2020202-0202-4202-8202-222222222222', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Table', 'table', 1, true, public.default_table_shared_config(), '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'),
  ('d3030303-0303-4303-8303-333333333333', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Kanban', 'kanban', 2, false, '{}'::jsonb, '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111');

insert into public.documents (
  id,
  project_id,
  project_view_id,
  title,
  content_md,
  content_json,
  version,
  created_by_user_id,
  updated_by_user_id
)
values (
  'e1111111-1111-4111-8111-111111111111',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'c4040404-0404-4404-8404-040404040404',
  'Launch brief',
  'Core launch notes for the product team.',
  public.rich_text_document_from_plain_text('Core launch notes for the product team.'),
  1,
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333'
);

insert into public.document_versions (
  id,
  document_id,
  version,
  title,
  content_md,
  content_json,
  created_by_user_id
)
values (
  'e1212121-1212-4121-8121-121212121212',
  'e1111111-1111-4111-8111-111111111111',
  1,
  'Launch brief',
  'Core launch notes for the product team.',
  public.rich_text_document_from_plain_text('Core launch notes for the product team.'),
  '11111111-1111-4111-8111-111111111111'
);

insert into public.document_comments (
  id,
  document_id,
  body_text,
  created_by_user_id
)
values (
  'e1313131-1313-4131-8131-131313131313',
  'e1111111-1111-4111-8111-111111111111',
  'Add the final rollout checklist before handoff.',
  '33333333-3333-4333-8333-333333333333'
);

insert into public.document_presence (
  document_id,
  user_id,
  state,
  last_seen_at
)
values (
  'e1111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  'editing',
  timezone('utc', now())
);

-- Default status options for Product Team project
insert into public.project_status_options (id, project_id, key, label, category, position, is_default)
values
  ('aa000001-0001-4001-8001-000000000001', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'todo',        'To Do',       'not_started', 0, true),
  ('aa000001-0001-4001-8001-000000000002', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'in_progress',  'In Progress', 'started',     0, false),
  ('aa000001-0001-4001-8001-000000000003', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'in_review',    'In Review',   'started',     1, false),
  ('aa000001-0001-4001-8001-000000000004', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'done',         'Done',        'completed',   0, false),
  ('aa000001-0001-4001-8001-000000000005', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'blocked',      'Blocked',     'started',     2, false);

-- Default status options for Launch Ops project
insert into public.project_status_options (id, project_id, key, label, category, position, is_default)
values
  ('aa000002-0001-4001-8001-000000000001', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'todo',        'To Do',       'not_started', 0, true),
  ('aa000002-0001-4001-8001-000000000002', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'in_progress',  'In Progress', 'started',     0, false),
  ('aa000002-0001-4001-8001-000000000003', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'in_review',    'In Review',   'started',     1, false),
  ('aa000002-0001-4001-8001-000000000004', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'done',         'Done',        'completed',   0, false),
  ('aa000002-0001-4001-8001-000000000005', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'blocked',      'Blocked',     'started',     2, false);

insert into public.cards (
  id,
  project_id,
  project_card_number,
  title,
  body_md,
  body_json,
  status_option_id,
  priority_option_id,
  assignee_user_id,
  start_at,
  due_at,
  effort,
  tags,
  position,
  created_by_user_id,
  updated_by_user_id
)
values
  (
    'f1111111-1111-4111-8111-111111111111',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    1,
    'Plan the next release',
    'Confirm launch owners and final milestones.',
    public.rich_text_document_from_plain_text('Confirm launch owners and final milestones.'),
    'aa000001-0001-4001-8001-000000000002',
    null,
    '33333333-3333-4333-8333-333333333333',
    current_date,
    current_date + 5,
    3,
    array['planning', 'launch']::text[],
    0,
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333'
  ),
  (
    'f2222222-2222-4222-8222-222222222222',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    2,
    'Draft onboarding copy',
    'Write the first-run workspace onboarding text.',
    public.rich_text_document_from_plain_text('Write the first-run workspace onboarding text.'),
    'aa000001-0001-4001-8001-000000000001',
    null,
    '11111111-1111-4111-8111-111111111111',
    current_date + 1,
    current_date + 7,
    2,
    array['ux']::text[],
    1,
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'f3333333-3333-4333-8333-333333333333',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    3,
    'Resolve analytics bug',
    'The tracking event still drops the workspace slug on save.',
    public.rich_text_document_from_plain_text('The tracking event still drops the workspace slug on save.'),
    'aa000001-0001-4001-8001-000000000005',
    null,
    '44444444-4444-4444-8444-444444444444',
    current_date - 1,
    current_date + 2,
    5,
    array['backend', 'metrics']::text[],
    2,
    '11111111-1111-4111-8111-111111111111',
    '44444444-4444-4444-8444-444444444444'
  ),
  (
    'f4444444-4444-4444-8444-444444444444',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    1,
    'Confirm release window',
    'Coordinate the private launch freeze window.',
    public.rich_text_document_from_plain_text('Coordinate the private launch freeze window.'),
    'aa000002-0001-4001-8001-000000000001',
    null,
    '44444444-4444-4444-8444-444444444444',
    current_date + 3,
    current_date + 10,
    2,
    array['launch']::text[],
    0,
    '11111111-1111-4111-8111-111111111111',
    '44444444-4444-4444-8444-444444444444'
  );

insert into public.card_comments (
  id,
  card_id,
  body_text,
  created_by_user_id
)
values (
  'f5151515-1515-4151-8151-151515151515',
  'f1111111-1111-4111-8111-111111111111',
  'Let us keep this visible in the table default view.',
  '33333333-3333-4333-8333-333333333333'
);

insert into public.field_definitions (
  id,
  project_id,
  key,
  name,
  field_type,
  position,
  created_by_user_id,
  updated_by_user_id
)
values
  (
    'f6161616-1616-4161-8161-161616161616',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'owner_note',
    'Owner note',
    'text',
    0,
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'f7171717-1717-4171-8171-171717171717',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'track',
    'Track',
    'single_select',
    1,
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111'
  );

insert into public.field_options (
  id,
  field_definition_id,
  label,
  position,
  created_by_user_id,
  updated_by_user_id
)
values
  ('f8181818-1818-4181-8181-181818181818', 'f7171717-1717-4171-8171-171717171717', 'Core', 0, '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'),
  ('f9191919-1919-4191-8191-191919191919', 'f7171717-1717-4171-8171-171717171717', 'Growth', 1, '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'),
  ('fa1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a', 'f7171717-1717-4171-8171-171717171717', 'Launch', 2, '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111');

insert into public.attachments (
  id,
  project_id,
  card_id,
  file_name,
  content_type,
  size_bytes,
  storage_path,
  uploaded_by_user_id
)
values (
  'ab111111-1111-4111-8111-111111111111',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'f1111111-1111-4111-8111-111111111111',
  'release-plan.pdf',
  'application/pdf',
  524288,
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc/f1111111-1111-4111-8111-111111111111/release-plan.pdf',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.attachments (
  id,
  project_id,
  document_id,
  file_name,
  content_type,
  size_bytes,
  storage_path,
  uploaded_by_user_id
)
values (
  'ab222222-2222-4222-8222-222222222222',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'e1111111-1111-4111-8111-111111111111',
  'launch-brief.png',
  'image/png',
  245760,
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc/e1111111-1111-4111-8111-111111111111/launch-brief.png',
  '33333333-3333-4333-8333-333333333333'
);

insert into public.project_invites (
  id,
  project_id,
  email,
  role,
  created_by_user_id,
  accept_token
)
values (
  'ac111111-1111-4111-8111-111111111111',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'empty@rocketboard.io',
  'member',
  '11111111-1111-4111-8111-111111111111',
  'accept-empty-user-product-team'
);
