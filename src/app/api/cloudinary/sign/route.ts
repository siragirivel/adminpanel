import { createHash } from "crypto";
import { NextResponse } from "next/server";

function signParams(params: Record<string, string>, apiSecret: string) {
  const serialized = Object.entries(params)
    .filter(([, value]) => value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1")
    .update(`${serialized}${apiSecret}`)
    .digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      folder?: string;
      format?: string;
      resourceType?: "image" | "raw" | "auto";
    };

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "Cloudinary server configuration is missing" },
        { status: 500 },
      );
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const folder = body.folder || "vehicles";
    const resourceType = body.resourceType || "image";
    const format = resourceType === "image" ? body.format || "webp" : body.format || "";
    const signature = signParams({ folder, format, timestamp }, apiSecret);

    return NextResponse.json({
      cloudName,
      apiKey,
      timestamp,
      folder,
      format,
      resourceType,
      signature,
    });
  } catch (error) {
    console.error("Cloudinary signature error:", error);
    return NextResponse.json(
      { error: "Failed to create upload signature" },
      { status: 500 },
    );
  }
}
