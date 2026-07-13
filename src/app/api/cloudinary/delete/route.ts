import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

function configureCloudinary() {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return false;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
  return true;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      publicId?: string;
      resourceType?: "image" | "raw";
    };

    if (!body.publicId) {
      return NextResponse.json({ error: "publicId is required" }, { status: 400 });
    }

    if (!configureCloudinary()) {
      return NextResponse.json({ error: "Cloudinary server configuration is missing" }, { status: 500 });
    }

    const result = await cloudinary.uploader.destroy(body.publicId, {
      resource_type: body.resourceType || "image",
      invalidate: true,
    });

    return NextResponse.json({ result: result.result || "unknown" });
  } catch (error) {
    console.error("Cloudinary delete error:", error);
    return NextResponse.json({ error: "Failed to delete asset" }, { status: 500 });
  }
}
