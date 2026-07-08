import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";

  // Only apply startup subdomain routing when the host starts with "startup."
  if (!host.startsWith("startup.")) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-product", "startup");

  // API routes are shared — pass through with the product header
  if (pathname.startsWith("/api/")) {
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // Paths already under /startups pass through unchanged
  if (pathname.startsWith("/startups")) {
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  let newPathname = pathname;

  if (pathname === "/" || pathname === "/markets") {
    newPathname = "/startups";
  } else if (pathname === "/leaderboard") {
    newPathname = "/startups/leaderboard";
  } else if (pathname === "/list") {
    newPathname = "/startups/list";
  } else if (pathname === "/profile") {
    newPathname = "/startups/profile";
  } else if (pathname.startsWith("/market/")) {
    newPathname = `/startups${pathname}`;
  }

  // No matching rewrite rule — pass through with the product header
  if (newPathname === pathname) {
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  const url = request.nextUrl.clone();
  url.pathname = newPathname;

  return NextResponse.rewrite(url, {
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
