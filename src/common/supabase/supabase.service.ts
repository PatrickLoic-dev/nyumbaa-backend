import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  readonly admin: SupabaseClient;
  readonly anon: SupabaseClient;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('supabase.url')!;

    this.admin = createClient(url, this.config.get<string>('supabase.serviceRoleKey')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    this.anon = createClient(url, this.config.get<string>('supabase.anonKey')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  /** Returns an anon client scoped to a user's JWT for actions requiring user context. */
  forUser(jwt: string): SupabaseClient {
    return createClient(
      this.config.get<string>('supabase.url')!,
      this.config.get<string>('supabase.anonKey')!,
      {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );
  }
}
