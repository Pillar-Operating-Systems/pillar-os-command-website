
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('owner', 'sales');

-- ============ TIMESTAMP HELPER ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by authenticated"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Roles viewable by authenticated"
  ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- ============ HANDLE NEW USER ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
BEGIN
  v_role := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'role','')::public.app_role,
    'sales'::public.app_role
  );
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ LEADS ============
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  industry TEXT DEFAULT '',
  suburb TEXT DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  website TEXT DEFAULT '',
  rating NUMERIC DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  web_score TEXT DEFAULT 'None',
  why_need_us TEXT DEFAULT '',
  cold_call_opener TEXT DEFAULT '',
  pillaros_pitch TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  last_contacted DATE,
  status TEXT NOT NULL DEFAULT 'new',
  follow_up_date DATE,
  follow_up_notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leads_business_phone_unique UNIQUE (business_name, phone)
);
CREATE INDEX idx_leads_status ON public.leads(status);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leads readable by authenticated"
  ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leads insertable by authenticated"
  ON public.leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Leads updatable by authenticated"
  ON public.leads FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Leads deletable by authenticated"
  ON public.leads FOR DELETE TO authenticated USING (true);
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;

-- ============ CLIENTS ============
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  industry TEXT DEFAULT '',
  suburb TEXT DEFAULT '',
  plan TEXT DEFAULT 'Starter',
  status TEXT DEFAULT 'Active',
  mrr NUMERIC DEFAULT 0,
  owner_name TEXT DEFAULT '',
  owner_mobile TEXT DEFAULT '',
  owner_email TEXT DEFAULT '',
  bif_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  active_employees JSONB NOT NULL DEFAULT '{}'::jsonb,
  internal_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients readable by authenticated"
  ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Clients insertable by authenticated"
  ON public.clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Clients updatable by authenticated"
  ON public.clients FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Clients deletable by authenticated"
  ON public.clients FOR DELETE TO authenticated USING (true);
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PIPELINE_DEALS ============
CREATE TABLE public.pipeline_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  contact_name TEXT DEFAULT '',
  contact_mobile TEXT DEFAULT '',
  contact_email TEXT DEFAULT '',
  industry TEXT DEFAULT '',
  suburb TEXT DEFAULT '',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  deal_value NUMERIC DEFAULT 0,
  mrr NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  next_action TEXT DEFAULT '',
  next_action_date DATE,
  stages JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_deals_status ON public.pipeline_deals(status);
ALTER TABLE public.pipeline_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deals readable by authenticated"
  ON public.pipeline_deals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Deals insertable by authenticated"
  ON public.pipeline_deals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Deals updatable by authenticated"
  ON public.pipeline_deals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Deals deletable by authenticated"
  ON public.pipeline_deals FOR DELETE TO authenticated USING (true);
CREATE TRIGGER update_pipeline_updated_at BEFORE UPDATE ON public.pipeline_deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.pipeline_deals REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_deals;

-- ============ TASKS ============
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  due_date DATE,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tasks readable by authenticated"
  ON public.tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Tasks insertable by authenticated"
  ON public.tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Tasks updatable by authenticated"
  ON public.tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Tasks deletable by authenticated"
  ON public.tasks FOR DELETE TO authenticated USING (true);
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ NOTES (per-user private) ============
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL DEFAULT '',
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Notes readable by owner"
  ON public.notes FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Notes insertable by owner"
  ON public.notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Notes updatable by owner"
  ON public.notes FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Notes deletable by owner"
  ON public.notes FOR DELETE TO authenticated USING (auth.uid() = created_by);
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ANALYTICS ============
CREATE TABLE public.analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  metric_value NUMERIC,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_analytics_client ON public.analytics(client_id);
ALTER TABLE public.analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Analytics readable by authenticated"
  ON public.analytics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Analytics insertable by authenticated"
  ON public.analytics FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Analytics updatable by authenticated"
  ON public.analytics FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Analytics deletable by authenticated"
  ON public.analytics FOR DELETE TO authenticated USING (true);

-- ============ SEED: Panel Beater Demo client ============
INSERT INTO public.clients (business_name, industry, suburb, plan, status, mrr, owner_name, owner_email, internal_notes)
VALUES (
  'Panel Beater Demo', 'Automotive', 'Brunswick, VIC', 'Growth', 'Active',
  2400, 'Demo Owner', 'demo@panelbeater.com.au',
  'Seeded record used to verify the Lovable Cloud connection.'
);
