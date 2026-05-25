
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_type text NOT NULL DEFAULT 'task';

DROP POLICY IF EXISTS "Tasks: read owner or assigned" ON public.tasks;
CREATE POLICY "Tasks: read owner assigned or unassigned"
ON public.tasks FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role)
  OR assigned_to = auth.uid()
  OR assigned_to IS NULL
);

DROP POLICY IF EXISTS "Tasks: owners insert" ON public.tasks;
CREATE POLICY "Tasks: authenticated insert"
ON public.tasks FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role)
  OR (
    (has_role(auth.uid(), 'sales'::app_role))
    AND (assigned_to IS NULL OR assigned_to = auth.uid())
  )
);
