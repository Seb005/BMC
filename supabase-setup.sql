-- ============================================================
-- Supabase Setup — Outils Kodra (BMC)
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text DEFAULT '',
  plan text DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 3. Profiles policies
CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- 4. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', ''));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Create bmc_canvases table
CREATE TABLE IF NOT EXISTS bmc_canvases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text DEFAULT 'Mon Business Model Canvas',
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 6. Index
CREATE INDEX IF NOT EXISTS idx_bmc_canvases_user ON bmc_canvases(user_id);

-- 7. Enable RLS on bmc_canvases
ALTER TABLE bmc_canvases ENABLE ROW LEVEL SECURITY;

-- 8. bmc_canvases policy
CREATE POLICY "Users CRUD own canvases"
  ON bmc_canvases FOR ALL USING (auth.uid() = user_id);

-- 9. Create ai_usage table
CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tool text NOT NULL DEFAULT 'bmc',
  tokens_in int DEFAULT 0,
  tokens_out int DEFAULT 0,
  month text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 10. Index
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_month ON ai_usage(user_id, month);

-- 11. Enable RLS on ai_usage
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- 12. ai_usage policy (read only for users, insert via service_role)
CREATE POLICY "Users read own usage"
  ON ai_usage FOR SELECT USING (auth.uid() = user_id);
