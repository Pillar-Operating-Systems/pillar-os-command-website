
DROP POLICY IF EXISTS "Sales can read pipeline deals" ON public.pipeline_deals;
DROP POLICY IF EXISTS "Sales can read all pipeline deals" ON public.pipeline_deals;
CREATE POLICY "Sales can read all pipeline deals" ON public.pipeline_deals
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Sales can insert pipeline deals" ON public.pipeline_deals;
CREATE POLICY "Sales can insert pipeline deals" ON public.pipeline_deals
FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Sales can update pipeline deals" ON public.pipeline_deals;
CREATE POLICY "Sales can update pipeline deals" ON public.pipeline_deals
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
