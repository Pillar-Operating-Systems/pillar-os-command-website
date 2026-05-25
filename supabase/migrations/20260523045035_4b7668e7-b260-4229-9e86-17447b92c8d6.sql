
-- 1. Profiles uniqueness (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_ci ON public.profiles (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_ci ON public.profiles (lower(username)) WHERE username IS NOT NULL;

-- 2. Leads: assigned_to + sales insert policy
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_to text DEFAULT '';

DROP POLICY IF EXISTS "Leads: sales insert" ON public.leads;
CREATE POLICY "Leads: sales insert" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'sales'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

-- 3. KPIs
CREATE TABLE IF NOT EXISTS public.kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  target numeric NOT NULL DEFAULT 0,
  period text NOT NULL DEFAULT 'weekly', -- daily | weekly | monthly
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL = all team
  metric_action text DEFAULT 'called',   -- analytics action_type to count
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "KPIs: authenticated read" ON public.kpis
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner'::public.app_role)
    OR public.has_role(auth.uid(), 'sales'::public.app_role)
  );

CREATE POLICY "KPIs: owners insert" ON public.kpis
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "KPIs: owners update" ON public.kpis
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "KPIs: owners delete" ON public.kpis
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE TRIGGER kpis_updated_at BEFORE UPDATE ON public.kpis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Notices
CREATE TABLE IF NOT EXISTS public.notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'normal', -- normal | important | urgent
  pinned boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notices: authenticated read" ON public.notices
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner'::public.app_role)
    OR public.has_role(auth.uid(), 'sales'::public.app_role)
  );

CREATE POLICY "Notices: owners insert" ON public.notices
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "Notices: owners update" ON public.notices
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "Notices: owners delete" ON public.notices
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE TRIGGER notices_updated_at BEFORE UPDATE ON public.notices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
