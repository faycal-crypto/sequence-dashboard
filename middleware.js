import { NextResponse } from "next/server";

// Optional Basic Auth. Enabled only when DASHBOARD_PASSWORD is set.
// Username is ignored; only the password must match.
export function middleware(request) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  // Allow Vercel cron to refresh without auth.
  if (request.headers.get("x-vercel-cron")) return NextResponse.next();

  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const pass = decoded.split(":").slice(1).join(":");
      if (pass === password) return NextResponse.next();
    } catch {}
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Sequence Dashboard"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
