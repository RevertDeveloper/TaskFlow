import { NextRequest, NextResponse } from "next/server";

const configuredPublicHost = process.env.TASKFLOW_PUBLIC_URL
  ? new URL(process.env.TASKFLOW_PUBLIC_URL).host
  : undefined;

export function proxy(request: NextRequest) {
  const requestHeaders = createApiRequestHeaders(request);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export function createApiRequestHeaders(request: { headers: Headers; nextUrl: { host: string } }): Headers {
  const requestHeaders = new Headers(request.headers);
  const forwardedHost = configuredPublicHost ?? request.headers.get("x-forwarded-host") ?? request.nextUrl.host;
  requestHeaders.set("x-forwarded-proto", "https");
  requestHeaders.set("host", forwardedHost);
  requestHeaders.set("x-forwarded-host", forwardedHost);
  return requestHeaders;
}

export const config = {
  matcher: "/api/:path*",
};