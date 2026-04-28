const SITE_ORIGIN = "https://wacky-wiki.com";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const host = url.hostname.toLowerCase();

  if (host === "www.wacky-wiki.com" || host.endsWith(".pages.dev")) {
    const redirectUrl = new URL(url.pathname + url.search, SITE_ORIGIN);
    return Response.redirect(redirectUrl.toString(), 301);
  }

  return context.next();
}
