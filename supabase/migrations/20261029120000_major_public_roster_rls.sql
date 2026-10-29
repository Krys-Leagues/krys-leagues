BEGIN;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON TABLE
  public.major_events,
  public.major_play_days,
  public.major_time_slots
TO anon, authenticated;

-- Raw registration rows are never public.
REVOKE SELECT ON TABLE public.major_entries FROM PUBLIC, anon;

-- Required by existing protected admin pages; RLS below restricts this to admins.
GRANT SELECT ON TABLE public.major_entries TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_major_entries(
  p_major_event_id uuid
)
RETURNS TABLE (
  roster_position bigint,
  player_screen_name_snapshot text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    row_number() OVER (ORDER BY e.registered_at, e.id),
    e.player_screen_name_snapshot,
    e.status
  FROM public.major_entries AS e
  JOIN public.major_events AS event
    ON event.id = e.major_event_id
  WHERE p_major_event_id IS NOT NULL
    AND e.major_event_id = p_major_event_id
    AND event.is_public = true
    AND event.is_test_event = false
    AND e.status IN ('registered', 'confirmed', 'waitlisted')
  ORDER BY e.registered_at, e.id;
$$;

ALTER FUNCTION public.get_public_major_entries(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_public_major_entries(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_public_major_entries(uuid)
TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'major_events'
      AND policyname = 'krys_public_major_events_read_v1'
  ) THEN
    CREATE POLICY krys_public_major_events_read_v1
      ON public.major_events
      FOR SELECT
      TO anon, authenticated
      USING (is_public = true AND is_test_event = false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'major_events'
      AND policyname = 'krys_admin_major_events_read_v1'
  ) THEN
    CREATE POLICY krys_admin_major_events_read_v1
      ON public.major_events
      FOR SELECT
      TO authenticated
      USING (public.is_current_user_site_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'major_play_days'
      AND policyname = 'krys_public_major_play_days_read_v1'
  ) THEN
    CREATE POLICY krys_public_major_play_days_read_v1
      ON public.major_play_days
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.major_events AS event
          WHERE event.id = major_play_days.major_event_id
            AND event.is_public = true
            AND event.is_test_event = false
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'major_play_days'
      AND policyname = 'krys_admin_major_play_days_manage_v1'
  ) THEN
    CREATE POLICY krys_admin_major_play_days_manage_v1
      ON public.major_play_days
      FOR ALL
      TO authenticated
      USING (public.is_current_user_site_admin())
      WITH CHECK (public.is_current_user_site_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'major_time_slots'
      AND policyname = 'krys_public_major_time_slots_read_v1'
  ) THEN
    CREATE POLICY krys_public_major_time_slots_read_v1
      ON public.major_time_slots
      FOR SELECT
      TO anon, authenticated
      USING (
        is_available = true
        AND EXISTS (
          SELECT 1
          FROM public.major_play_days AS day
          JOIN public.major_events AS event
            ON event.id = day.major_event_id
          WHERE day.id = major_time_slots.play_day_id
            AND event.is_public = true
            AND event.is_test_event = false
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'major_time_slots'
      AND policyname = 'krys_admin_major_time_slots_manage_v1'
  ) THEN
    CREATE POLICY krys_admin_major_time_slots_manage_v1
      ON public.major_time_slots
      FOR ALL
      TO authenticated
      USING (public.is_current_user_site_admin())
      WITH CHECK (public.is_current_user_site_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'major_entries'
      AND policyname = 'krys_admin_major_entries_read_v1'
  ) THEN
    CREATE POLICY krys_admin_major_entries_read_v1
      ON public.major_entries
      FOR SELECT
      TO authenticated
      USING (public.is_current_user_site_admin());
  END IF;
END
$$;

COMMIT;
