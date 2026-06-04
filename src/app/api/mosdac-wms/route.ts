import {
  buildMosdacUrl,
  getFallbackDatetime,
} from "../../../lib/mosdac";

const EMPTY_TILE =
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
    "base64"
  );

export async function GET(
  request: Request
) {
  try {
    const { searchParams } =
      new URL(request.url);

    const targetUrl =
      buildMosdacUrl(
        searchParams
      );

      const fallbackDatetime =
  getFallbackDatetime(
    searchParams.get(
      "datetime"
    ) || ""
  );

const fallbackParams =
  new URLSearchParams(
    searchParams
  );

fallbackParams.set(
  "datetime",
  fallbackDatetime
);

const fallbackUrl =
  buildMosdacUrl(
    fallbackParams
  );

    const controller =
  new AbortController();

const timeout =
  setTimeout(() => {
    controller.abort();
  }, 8000);

const response =
  await fetch(targetUrl, {
    headers: {
      Referer:
        "https://www.mosdac.gov.in/live/index_one.php?url_name=india",

      Origin:
        "https://www.mosdac.gov.in",
    },

    signal:
      controller.signal,
  });

clearTimeout(timeout);

    if (
  !response.ok
) {

  const fallback =
    await fetch(
      fallbackUrl,
      {
        headers: {
          Referer:
            "https://www.mosdac.gov.in/live/index_one.php?url_name=india",

          Origin:
            "https://www.mosdac.gov.in",
        },
      }
    );

  if (
    fallback.ok
  ) {

    const buffer =
      await fallback.arrayBuffer();

    return new Response(
      buffer,
      {
        headers: {
          "Content-Type":
            "image/png",
        },
      }
    );
  }

  return new Response(
    EMPTY_TILE,
    {
      headers: {
        "Content-Type":
          "image/png",
      },
    }
  );
}

    const imageBuffer =
      await response.arrayBuffer();

console.log(
  "MOSDAC SIZE:",
  imageBuffer.byteLength
);

    const isHistory =
  searchParams.has(
    "datetime"
  );

return new Response(
  imageBuffer,
  {
    headers: {
      "Content-Type":
        "image/png",

      // CACHE STRATEGY

      "Cache-Control":
        isHistory
          ? "public, max-age=86400"
          : "public, max-age=300",
    },
  }
);
  } catch (error) {
    console.error(error);

    return new Response(
  EMPTY_TILE,
  {
    headers: {
      "Content-Type":
        "image/png",
    },
  }
);
  }
}