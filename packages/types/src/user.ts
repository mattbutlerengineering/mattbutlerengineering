/**
 * User entity
 */
export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * User profile (public-facing subset)
 */
export interface UserProfile {
  id: string;
  name: string | null;
  picture: string | null;
}

/**
 * Create user request
 */
export interface CreateUserRequest {
  email: string;
  name?: string;
  picture?: string;
}

/**
 * Update user request
 */
export interface UpdateUserRequest {
  name?: string;
  picture?: string;
}
