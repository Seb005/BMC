import { createClient } from '@supabase/supabase-js';

/**
 * One-time setup script to create database tables.
 * Call via: GET /api/setup-db?key=YOUR_SECRET
 * Delete this file after running it once.
 */
export default async function handler(req, res) {
  // Simple auth — require a query param to prevent accidental runs
  if (req.query.key !== 'kodra-setup-2026') {
    return res.status(403).json({ error: 'Unauthorized. Add ?key=kodra-setup-2026' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const results = [];

  // Execute SQL statements via the REST API
  const sqlStatements = [
    // 1. Create profiles table
    `CREATE TABLE IF NOT EXISTS profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email text NOT NULL,
      full_name text DEFAULT '',
      plan text DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );`,

    // 2. Enable RLS on profiles
    `ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;`,

    // 3. Profiles policies
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users read own profile' AND tablename = 'profiles') THEN
        CREATE POLICY "Users read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
      END IF;
    END $$;`,

    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users update own profile' AND tablename = 'profiles') THEN
        CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
      END IF;
    END $$;`,

    // 4. Trigger to auto-create profile on signup
    `CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS trigger AS $$
    BEGIN
      INSERT INTO public.profiles (id, email, full_name)
      VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', ''));
      RETURN new;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;`,

    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
        CREATE TRIGGER on_auth_user_created
          AFTER INSERT ON auth.users
          FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
      END IF;
    END $$;`,

    // 5. Create bmc_canvases table
    `CREATE TABLE IF NOT EXISTS bmc_canvases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      title text DEFAULT 'Mon Business Model Canvas',
      data jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );`,

    // 6. Index
    `CREATE INDEX IF NOT EXISTS idx_bmc_canvases_user ON bmc_canvases(user_id);`,

    // 7. Enable RLS on bmc_canvases
    `ALTER TABLE bmc_canvases ENABLE ROW LEVEL SECURITY;`,

    // 8. bmc_canvases policy
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users CRUD own canvases' AND tablename = 'bmc_canvases') THEN
        CREATE POLICY "Users CRUD own canvases" ON bmc_canvases FOR ALL USING (auth.uid() = user_id);
      END IF;
    END $$;`,

    // 9. Create ai_usage table
    `CREATE TABLE IF NOT EXISTS ai_usage (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      tool text NOT NULL DEFAULT 'bmc',
      tokens_in int DEFAULT 0,
      tokens_out int DEFAULT 0,
      month text NOT NULL,
      created_at timestamptz DEFAULT now()
    );`,

    // 10. Index
    `CREATE INDEX IF NOT EXISTS idx_ai_usage_user_month ON ai_usage(user_id, month);`,

    // 11. Enable RLS on ai_usage
    `ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;`,

    // 12. ai_usage policy (read only for users)
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users read own usage' AND tablename = 'ai_usage') THEN
        CREATE POLICY "Users read own usage" ON ai_usage FOR SELECT USING (auth.uid() = user_id);
      END IF;
    END $$;`
  ];

  for (let i = 0; i < sqlStatements.length; i++) {
    const sql = sqlStatements[i];
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).maybeSingle();

    if (error) {
      // Try direct REST SQL approach via PostgREST
      // If rpc doesn't work, use the management API
      results.push({
        step: i + 1,
        status: 'error',
        message: error.message,
        hint: error.hint || ''
      });
    } else {
      results.push({ step: i + 1, status: 'ok' });
    }
  }

  return res.status(200).json({
    message: 'Setup complete. Review results below.',
    note: 'If rpc errors occurred, run the SQL manually in Supabase Dashboard > SQL Editor.',
    results,
    sql: sqlStatements.join('\n\n')
  });
}
