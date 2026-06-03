import fs from "fs";
import path from "path";

export async function POST(
  req: Request
) {
  try {
    const body =
      await req.json();

    const {
      imageUrl,
      filename,
    } = body;

    if (
      !imageUrl ||
      !filename
    ) {
      return Response.json(
        {
          error:
            "Missing fields",
        },
        { status: 400 }
      );
    }

    // FETCH IMAGE
    const response =
      await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(
        "Failed to fetch image"
      );
    }

    const arrayBuffer =
      await response.arrayBuffer();

    const buffer =
      Buffer.from(
        arrayBuffer
      );

    // CACHE PATH
    const cacheDir =
      path.join(
        process.cwd(),
        "public",
        "insat-cache"
      );

    // CREATE FOLDER IF NOT EXISTS
    if (
      !fs.existsSync(
        cacheDir
      )
    ) {
      fs.mkdirSync(
        cacheDir,
        {
          recursive: true,
        }
      );
    }

    // SAVE FILE
    const filePath =
      path.join(
        cacheDir,
        filename
      );

    fs.writeFileSync(
      filePath,
      buffer
    );

    return Response.json({
      success: true,
      filename,
    });
  } catch (err) {
    console.error(err);

    return Response.json(
      {
        error:
          "Caching failed",
      },
      { status: 500 }
    );
  }
}