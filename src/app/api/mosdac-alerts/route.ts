export async function GET() {
  try {
    const response =
      await fetch(
        "https://www.mosdac.gov.in/live/backend/rain_cloudburst.php",
        {
          headers: {
            Referer:
              "https://www.mosdac.gov.in/live/index_one.php?url_name=india",

            Origin:
              "https://www.mosdac.gov.in",
          },

          cache: "no-store",
        }
      );

    const text =
      await response.text();

    return new Response(text, {
      headers: {
        "Content-Type":
          "application/json",

        "Cache-Control":
          "public, max-age=300",
      },
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error:
          "Failed to fetch MOSDAC alerts",
      },
      {
        status: 500,
      }
    );
  }
}