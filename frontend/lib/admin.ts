import { getAuthenticatedUser, AuthenticatedUser } from './auth-helpers'

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email.toLowerCase());
}

export async function getAdminUser(request: Request): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser(request)
  if (!isAdmin(user.email)) {
    const err = new Error('Forbidden')
    ;(err as any).status = 403
    throw err
  }
  return user
}
