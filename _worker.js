/**
 * Cloudflare Pages Advanced Mode Worker — heavymoose.com
 * Blocks internal files from public access.
 * Serves static assets for all other routes.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
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

    // Serve static asset via Cloudflare Pages
    return env.ASSETS.fetch(request);
  },
};
