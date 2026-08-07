const ADS_TXT = "google.com, pub-7298667883751711, DIRECT, f08c47fec0942fa0\n";

export function onRequestGet() {
  return new Response(ADS_TXT, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, must-revalidate",
      "X-Robots-Tag": "all",
    },
  });
}

export function onRequestHead() {
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, must-revalidate",
      "X-Robots-Tag": "all",
    },
  });
}
