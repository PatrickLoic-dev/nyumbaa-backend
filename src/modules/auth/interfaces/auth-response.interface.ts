import { Session, User } from '@supabase/supabase-js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export function toAuthResponse(user: User, session: Session): AuthResponse {
  return {
    user,
    tokens: {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at ?? 0,
    },
  };
}
