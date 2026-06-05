import fs from "fs";
import path from "path";

export async function GET() {
  try {

    const filePath = path.join(
      process.cwd(),
      "thunderstorm-cells.json"
    );

    const data = fs.readFileSync(
      filePath,
      "utf8"
    );

    return Response.json(
      JSON.parse(data)
    );

  } catch (error) {

    return Response.json(
      [],
      {
        status: 200,
      }
    );

  }
}