-- Drift Watcher hourly cron schedule.
--
-- Wires the previously deployed `drift-watcher` edge function into pg_cron
-- so it ticks every hour at minute 0. This is the first production
-- pg_cron usage in Rocketboard. The schedule reads two values from
-- Supabase Vault at fire time:
--
--   - `project_url`       — the project's public Supabase URL (no
--                           trailing slash). Used as the base for
--                           constructing the function URL.
--   - `service_role_key`  — the project's service role JWT, sent in
--                           the Authorization header. The drift-watcher
--                           function refuses anything that doesn't match
--                           SUPABASE_SERVICE_ROLE_KEY exactly, so the
--                           secret value here must equal the function
--                           runtime's secret.
--
-- These secrets must be created in each environment **before** this
-- migration ticks for the first time. They cannot be created via SQL
-- migration because Vault masks the underlying secret_id behind a
-- per-project encryption key. Bootstrap in Supabase Studio (Database →
-- Vault → New secret), or via the management API. Suggested seed:
--
--   project_url       = https://<project-ref>.supabase.co
--   service_role_key  = <eyJ... service role JWT from Project Settings>
--
-- If either secret is missing at fire time, `vault.decrypted_secrets`
-- yields no row, the URL coalesces to NULL, and `net.http_post` errors
-- in the cron job log without affecting other workloads. That is the
-- intended fail-loud-but-isolated behaviour for the first tick after
-- deploy.
--
-- The drift-watcher function itself short-circuits on orgs that have
-- not opted in (`organizations.drift_watcher_enabled = false` is the
-- default), so flipping this cron job on globally costs at most one
-- HTTP round trip per hour while the org table is empty of opt-ins.

-- Idempotent: drop any prior schedule with the same name before
-- re-creating, so re-running this migration (or a follow-up that
-- adjusts the cadence) replaces cleanly.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'drift-watcher-hourly') then
    perform cron.unschedule('drift-watcher-hourly');
  end if;
end
$$;

select cron.schedule(
  'drift-watcher-hourly',
  '0 * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'project_url'
      limit 1
    ) || '/functions/v1/drift-watcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'service_role_key'
        limit 1
      )
    ),
    body := jsonb_build_object()
  );
  $cron$
);
