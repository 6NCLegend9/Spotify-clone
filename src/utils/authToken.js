export function authSecret() {
  return process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
}

export function tokenOptions(req) {
  return { req, secret: authSecret() };
}
