import { createClient } from '@supabase/supabase-js';

export const createServerClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use service role key ONLY on server
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
};
