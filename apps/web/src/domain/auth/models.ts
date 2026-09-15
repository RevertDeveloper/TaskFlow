export type AuthUser = {
  id: number;
  username: string;
  email: string;
  email_verified: boolean;
  first_name: string;
  last_name: string;
  plan: string | null;
};

export type AuthMeResponse =
  | { authenticated: false; user: null }
  | { authenticated: true; user: AuthUser };

export type LoginInput = {
  identifier: string;
  password: string;
};

export type RegisterInput = {
  username: string;
  email: string;
  password: string;
  accepted_terms: true;
};

export type VerifyEmailInput = {
  email: string;
  code: string;
};