export function isTrustedOrigin(request: Request,canonicalOrigin=process.env.APP_URL): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const supplied=new URL(origin);
    const expected=new URL(canonicalOrigin??request.url);
    return supplied.origin===origin&&supplied.origin===expected.origin;
  } catch { return false; }
}
