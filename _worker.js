/**
 * Cloudflare Pages Advanced Mode Worker — heavymoose.com
 * Blocks internal files from public access.
 * Serves static assets for all other routes.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.hostname === "www.heavymoose.com") {
      url.hostname = "heavymoose.com";
      return Response.redirect(url.toString(), 301);
    }

    const rawPath = url.pathname || "/";
    let decodedPath = rawPath;
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch {
      // Leave as-is if decoding fails
    }

    const pathLower = String(decodedPath).toLowerCase();
    const normalizedPath = pathLower.endsWith("/") ? pathLower : `${pathLower}/`;

    const blockedPrefixes = [
      "/scripts/",
      "/.github/",
      "/.husky/",
      "/.git/",
    ];

    const blockedExact = new Set([
      "/_worker.js",
      "/package.json",
      "/package-lock.json",
      "/wrangler.toml",
      "/.gitignore",
    ]);

    if (blockedExact.has(pathLower)) {
      return new Response("Not found", { status: 404 });
    }

    for (const prefix of blockedPrefixes) {
      if (normalizedPath.startsWith(prefix)) {
        return new Response("Not found", { status: 404 });
      }
    }


    const htmlAliases = new Map([
      ["/music", "/music.html"],
      ["/videos", "/videos.html"],
      ["/america-250-art-prompts", "/america-250-art-prompts.html"],
      ["/video-missed-some-80s", "/video-missed-some-80s.html"],
      ["/video-no", "/video-no.html"],
      ["/video-lux-laugh-protocol", "/video-lux-laugh-protocol.html"],
      ["/video-move-then-prove", "/video-move-then-prove.html"],
      ["/video-wiggle-pit-it", "/video-wiggle-pit-it.html"],
      ["/video-well-deep", "/video-well-deep.html"],
      ["/video-have-a-waffle", "/video-have-a-waffle.html"],
      ["/video-try-meh", "/video-try-meh.html"],
      ["/video-jack", "/video-jack.html"],
    ]);

    if (htmlAliases.has(pathLower)) {
      const rewritten = new URL(request.url);
      rewritten.pathname = htmlAliases.get(pathLower);
      return env.ASSETS.fetch(new Request(rewritten.toString(), request));
    }

    // Serve static asset via Cloudflare Pages
    return env.ASSETS.fetch(request);
  },
};
