CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  -- Always assign 'sales' on signup. Owner role is granted manually via Sales Team page.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'sales'::public.app_role);
  RETURN NEW;
END;
$function$;