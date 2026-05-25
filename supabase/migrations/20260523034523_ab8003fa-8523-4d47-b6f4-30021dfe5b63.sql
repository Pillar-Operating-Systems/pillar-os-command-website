
-- 1. Uniqueness constraints (case-insensitive via lower())
-- Drop any existing duplicates safely: use partial unique indexes on lower().
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_ci
  ON public.profiles (lower(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_ci
  ON public.profiles (lower(email));

-- 2. Analytics table: extend for sales action tracking
ALTER TABLE public.analytics
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS action_type text,
  ADD COLUMN IF NOT EXISTS lead_id uuid,
  ADD COLUMN IF NOT EXISTS lead_business_name text;

-- Make legacy metric_key nullable since action rows don't use it
ALTER TABLE public.analytics ALTER COLUMN metric_key DROP NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_user_recorded_idx
  ON public.analytics (user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS analytics_action_idx
  ON public.analytics (action_type, recorded_at DESC);

-- 3. RLS: staff can insert their own rows and read their own; owners read all
DROP POLICY IF EXISTS "Analytics: owners all" ON public.analytics;

CREATE POLICY "Analytics: owners read all"
  ON public.analytics FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Analytics: own read"
  ON public.analytics FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Analytics: own insert"
  ON public.analytics FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'sales'::app_role))
  );

CREATE POLICY "Analytics: owners delete"
  ON public.analytics FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));
