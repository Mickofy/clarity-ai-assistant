export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* =====================================================
       BASIC SECURITY
       ===================================================== */

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          Allow: "GET, HEAD",
        },
      });
    }

    const authorization = request.headers.get("Authorization") || "";

    const expectedAuthorization = `Bearer ${env.UPDATE_GATEWAY_TOKEN}`;

    if (!env.UPDATE_GATEWAY_TOKEN || authorization !== expectedAuthorization) {
      return new Response("Forbidden", {
        status: 403,
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    /* =====================================================
       OBJECT PATH
       ===================================================== */

    let key;

    try {
      key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      return new Response("Bad Request", {
        status: 400,
      });
    }

    if (!key) {
      return new Response("Not Found", {
        status: 404,
      });
    }

    /*
      Only expose files required by electron-updater.

      No bucket listing.
      No arbitrary R2 files.
    */
    const allowed =
      key === "latest.yml" ||
      key.endsWith(".exe") ||
      key.endsWith(".exe.blockmap") ||
      key.endsWith(".blockmap");

    if (!allowed) {
      return new Response("Not Found", {
        status: 404,
      });
    }

    /* =====================================================
       RANGE SUPPORT
       ===================================================== */

    const rangeHeader = request.headers.get("Range");

    const getOptions = {};

    if (rangeHeader) {
      getOptions.range = request.headers;
    }

    /* =====================================================
       GET PRIVATE R2 OBJECT
       ===================================================== */

    const object = await env.UPDATES_BUCKET.get(key, getOptions);

    if (!object) {
      return new Response("Not Found", {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    /* =====================================================
       RESPONSE HEADERS
       ===================================================== */

    const headers = new Headers();

    object.writeHttpMetadata(headers);

    headers.set("ETag", object.httpEtag);

    headers.set("Accept-Ranges", "bytes");

    /*
      Update metadata should be checked frequently.
    */
    if (key === "latest.yml") {
      headers.set(
        "Cache-Control",
        "private, no-cache, no-store, must-revalidate",
      );
    } else {
      /*
        Versioned installers can safely cache.
      */
      headers.set("Cache-Control", "private, max-age=86400");
    }

    headers.set("X-Content-Type-Options", "nosniff");

    headers.set("Referrer-Policy", "no-referrer");

    /* =====================================================
       RANGE RESPONSE
       ===================================================== */

    let status = 200;

    if (object.range && typeof object.range.offset === "number") {
      const start = object.range.offset;

      const length = object.range.length;

      const end = start + length - 1;

      headers.set("Content-Range", `bytes ${start}-${end}/${object.size}`);

      headers.set("Content-Length", String(length));

      status = 206;
    } else {
      headers.set("Content-Length", String(object.size));
    }

    /* =====================================================
       HEAD
       ===================================================== */

    if (request.method === "HEAD") {
      return new Response(null, {
        status,
        headers,
      });
    }

    /* =====================================================
       GET
       ===================================================== */

    return new Response(object.body, {
      status,
      headers,
    });
  },
};
