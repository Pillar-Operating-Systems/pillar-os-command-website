-- 1. allowed_emails table
CREATE TABLE IF NOT EXISTS public.allowed_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allowlist: owners read"
  ON public.allowed_emails FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Allowlist: owners insert"
  ON public.allowed_emails FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Allowlist: owners update"
  ON public.allowed_emails FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Allowlist: owners delete"
  ON public.allowed_emails FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- 2. username on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx
  ON public.profiles ((lower(username))) WHERE username IS NOT NULL;

-- 3. Updated handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_username text;
BEGIN
  v_username := COALESCE(NEW.raw_user_meta_data->>'username',
                         NEW.raw_user_meta_data->>'display_name',
                         split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles (id, email, display_name, username)
  VALUES (NEW.id, NEW.email, v_username, v_username);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'sales'::public.app_role);

  UPDATE public.allowed_emails SET used = true
    WHERE lower(email) = lower(NEW.email);

  RETURN NEW;
END;
$function$;

-- 4. Pre-authorise owner email
INSERT INTO public.allowed_emails (email, used)
VALUES ('willc@pillaros.net', true)
ON CONFLICT (email) DO UPDATE SET used = true;

-- 5. Backfill username for existing profiles (use display_name or email prefix)
UPDATE public.profiles
SET username = COALESCE(NULLIF(display_name, ''), split_part(email, '@', 1))
WHERE username IS NULL;