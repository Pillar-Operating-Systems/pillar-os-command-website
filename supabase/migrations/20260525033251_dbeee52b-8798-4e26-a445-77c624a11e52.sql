
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users only" ON public.ai_agents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON public.automation_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON public.automations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON public.digital_employees FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON public.error_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON public.deployments FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Sales can update pipeline deals" ON public.pipeline_deals;
DROP POLICY IF EXISTS "Sales can insert pipeline deals" ON public.pipeline_deals;
DROP POLICY IF EXISTS "Sales can read all pipeline deals" ON public.pipeline_deals;

CREATE POLICY "Sales can update own deals" ON public.pipeline_deals
FOR UPDATE TO authenticated
USING (
  assigned_to IN (SELECT COALESCE(username, display_name, email) FROM public.profiles WHERE id = auth.uid())
  OR public.has_role(auth.uid(), 'owner'::public.app_role)
)
WITH CHECK (
  assigned_to IN (SELECT COALESCE(username, display_name, email) FROM public.profiles WHERE id = auth.uid())
  OR public.has_role(auth.uid(), 'owner'::public.app_role)
);
