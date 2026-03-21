import imageCompression from 'browser-image-compression';

type UploadKind = "vehicle" | "bill";

interface UploadOptions {
  kind?: UploadKind;
  folder?: string;
}

const UPLOAD_CONFIG: Record<UploadKind, {
  folder: string;
  maxSizeMB: number;
  maxWidthOrHeight: number;
  initialQuality: number;
}> = {
  vehicle: {
    folder: "siragirvel/vehicles",
    maxSizeMB: 0.12,
    maxWidthOrHeight: 1280,
    initialQuality: 0.75,
  },
  bill: {
    folder: "siragirvel/bills",
    maxSizeMB: 0.08,
    maxWidthOrHeight: 1024,
    initialQuality: 0.7,
  },
};

export async function uploadToCloudinary(
  file: File,
  uploadOptions: UploadOptions = {},
) {
  try {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    if (!cloudName) {
      throw new Error("Cloudinary is not configured");
    }

    const kind = uploadOptions.kind || "vehicle";
    const config = UPLOAD_CONFIG[kind];
    const folder = uploadOptions.folder || config.folder;

    const signatureResponse = await fetch("/api/cloudinary/sign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ folder, format: "webp" }),
    });

    const signatureData = await signatureResponse.json();
    if (!signatureResponse.ok) {
      throw new Error(signatureData?.error || "Failed to prepare image upload");
    }

    // 1. Compress Image (Extremely low size for bills)
    const compressionOptions = {
      maxSizeMB: config.maxSizeMB,
      maxWidthOrHeight: config.maxWidthOrHeight,
      useWebWorker: true,
      initialQuality: config.initialQuality,
      fileType: "image/webp",
    };
    const compressedFile = await imageCompression(file, compressionOptions);
    const webpFile = new File(
      [compressedFile],
      `${file.name.replace(/\.[^.]+$/, "")}.webp`,
      { type: "image/webp" },
    );

    // 2. Prepare Form Data
    const formData = new FormData();
    formData.append('file', webpFile);
    formData.append('api_key', signatureData.apiKey);
    formData.append('timestamp', String(signatureData.timestamp));
    formData.append('signature', signatureData.signature);
    formData.append('folder', signatureData.folder);
    formData.append('format', signatureData.format || 'webp');

    // 3. Upload to Cloudinary
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    const data = await response.json();
    if (!response.ok || !data?.secure_url) {
      throw new Error(data?.error?.message || "Image upload failed");
    }

    return data.secure_url;
  } catch (error) {
    console.error('Cloudinary Upload Error:', error);
    throw error;
  }
}
