import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/session";

// Optional single-user password gate. Only active when APP_PASSWORD is set in
// .env. When unset, the app is open (useful for local development).
// Uses only Edge-safe Web Crypto via @/lib/session.
export async function middleware(req: NextRequest) {
  const passwordSet = Boolean(process.env.APP_PASSWORD && process.env.APP_PASSWORD.length >= 4);
  if (!passwordSet) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth") || pathname.startsWith("/_next") || pathname === "/manifest.webmanifest" || pathname.startsWith("/icons/") || pathname === "/sw.js") {
    return NextResponse.next();
  }

  const token = req.cookies.get("tm_session")?.value;
  if (await verifySession(token)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized. Log in first." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
