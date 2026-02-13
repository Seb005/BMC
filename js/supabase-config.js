// ============================================================
// Supabase Config — Shared across all Kodra tools
// ============================================================

const SUPABASE_URL = 'https://fenlyuelafsvtdhznufi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlbmx5dWVsYWZzdnRkaHpudWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MzcyMjcsImV4cCI6MjA4NjUxMzIyN30.LPmtz9YeGFJhCdwEHhJNh-Vi0zFE7NEmsTYBargb5fM';

// Init Supabase client (loaded via CDN: @supabase/supabase-js@2)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Auth Helpers ---

/**
 * Get the current authenticated user, or null.
 */
async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Get the current session (includes access_token).
 */
async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/**
 * Redirect to login page if user is not authenticated.
 * Call at the top of protected pages (dashboard, app).
 */
async function requireAuth() {
  const user = await getUser();
  if (!user) {
    window.location.href = '/';
    return null;
  }
  return user;
}

/**
 * Sign out and redirect to login page.
 */
async function signOut() {
  await supabase.auth.signOut();
  window.location.href = '/';
}

/**
 * Sign in with email + password.
 */
async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

/**
 * Sign up with email + password.
 */
async function signUpWithPassword(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || '' }
    }
  });
  return { data, error };
}

/**
 * Send a magic link to the email.
 */
async function signInWithMagicLink(email) {
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + '/dashboard.html'
    }
  });
  return { data, error };
}
