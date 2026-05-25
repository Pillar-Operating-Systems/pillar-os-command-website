
-- Helper: current user role check using existing has_role function

-- ============ CLIENTS ============
DROP POLICY IF EXISTS "Clients readable by authenticated" ON public.clients;
DROP POLICY IF EXISTS "Clients insertable by authenticated" ON public.clients;
DROP POLICY IF EXISTS "Clients updatable by authenticated" ON public.clients;
DROP POLICY IF EXISTS "Clients deletable by authenticated" ON public.clients;

CREATE POLICY "Clients: owners read" ON public.clients FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Clients: owners insert" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Clients: owners update" ON public.clients FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Clients: owners delete" ON public.clients FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- ============ LEADS ============
DROP POLICY IF EXISTS "Leads readable by authenticated" ON public.leads;
DROP POLICY IF EXISTS "Leads insertable by authenticated" ON public.leads;
DROP POLICY IF EXISTS "Leads updatable by authenticated" ON public.leads;
DROP POLICY IF EXISTS "Leads deletable by authenticated" ON public.leads;

CREATE POLICY "Leads: authenticated read" ON public.leads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'sales'));
CREATE POLICY "Leads: owners insert" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Leads: owner or sales update" ON public.leads FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'sales'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'sales'));
CREATE POLICY "Leads: owners delete" ON public.leads FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- ============ PIPELINE DEALS ============
DROP POLICY IF EXISTS "Deals readable by authenticated" ON public.pipeline_deals;
DROP POLICY IF EXISTS "Deals insertable by authenticated" ON public.pipeline_deals;
DROP POLICY IF EXISTS "Deals updatable by authenticated" ON public.pipeline_deals;
DROP POLICY IF EXISTS "Deals deletable by authenticated" ON public.pipeline_deals;

CREATE POLICY "Deals: authenticated read" ON public.pipeline_deals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'sales'));
CREATE POLICY "Deals: owners insert" ON public.pipeline_deals FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Deals: owner or assigned sales update" ON public.pipeline_deals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR (public.has_role(auth.uid(), 'sales') AND assigned_to = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR (public.has_role(auth.uid(), 'sales') AND assigned_to = auth.uid()));
CREATE POLICY "Deals: owners delete" ON public.pipeline_deals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- ============ ANALYTICS ============
DROP POLICY IF EXISTS "Analytics readable by authenticated" ON public.analytics;
DROP POLICY IF EXISTS "Analytics insertable by authenticated" ON public.analytics;
DROP POLICY IF EXISTS "Analytics updatable by authenticated" ON public.analytics;
DROP POLICY IF EXISTS "Analytics deletable by authenticated" ON public.analytics;

CREATE POLICY "Analytics: owners all" ON public.analytics FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- ============ TASKS ============
DROP POLICY IF EXISTS "Tasks readable by authenticated" ON public.tasks;
DROP POLICY IF EXISTS "Tasks insertable by authenticated" ON public.tasks;
DROP POLICY IF EXISTS "Tasks updatable by authenticated" ON public.tasks;
DROP POLICY IF EXISTS "Tasks deletable by authenticated" ON public.tasks;

CREATE POLICY "Tasks: read owner or assigned" ON public.tasks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR assigned_to = auth.uid());
CREATE POLICY "Tasks: owners insert" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Tasks: owner or assignee update" ON public.tasks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR assigned_to = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR assigned_to = auth.uid());
CREATE POLICY "Tasks: owners delete" ON public.tasks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- ============ PROFILES ============
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Profiles: own or owner read" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'owner'));

-- ============ USER ROLES ============
DROP POLICY IF EXISTS "Roles viewable by authenticated" ON public.user_roles;
CREATE POLICY "Roles: own or owner read" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'owner'));

-- ============ REALTIME ============
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Realtime: authenticated only" ON realtime.messages;
CREATE POLICY "Realtime: authenticated only" ON realtime.messages FOR SELECT TO authenticated
  USING (true);

-- ============ FUNCTION EXECUTE LOCKDOWN ============
REVOKE EXECUTE ON FUNCTION public.lead_facets() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
