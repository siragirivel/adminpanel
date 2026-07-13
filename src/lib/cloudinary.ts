import imageCompression from 'browser-image-compression';

type UploadKind = "vehicle" | "bill" | "employee";

interface UploadOptions {
  kind?: UploadKind;
  folder?: string;
}

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
  resourceType: "image" | "raw";
}

const isPdfFile = (file: File) =>
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

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
  employee: {
    folder: "siragirvel/employees",
    maxSizeMB: 0.12,
    maxWidthOrHeight: 1280,
    initialQuality: 0.75,
  },
};

export async function uploadToCloudinaryDetailed(
  file: File,
  uploadOptions: UploadOptions = {},
): Promise<CloudinaryUploadResult> {
  try {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    if (!cloudName) {
      throw new Error("Cloudinary is not configured");
    }

    const kind = uploadOptions.kind || "vehicle";
    const config = UPLOAD_CONFIG[kind];
    const folder = uploadOptions.folder || config.folder;
    const uploadPdf = kind === "bill" && isPdfFile(file);

    const signatureResponse = await fetch("/api/cloudinary/sign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        folder,
        format: uploadPdf ? undefined : "webp",
        resourceType: uploadPdf ? "raw" : "image",
      }),
    });

    const signatureData = await signatureResponse.json();
    if (!signatureResponse.ok) {
      throw new Error(signatureData?.error || "Failed to prepare upload");
    }

    const formData = new FormData();
    if (uploadPdf) {
      formData.append("file", file);
    } else {
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
      formData.append("file", webpFile);
      formData.append("format", signatureData.format || "webp");
    }
    formData.append('api_key', signatureData.apiKey);
    formData.append('timestamp', String(signatureData.timestamp));
    formData.append('signature', signatureData.signature);
    formData.append('folder', signatureData.folder);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${signatureData.resourceType || (uploadPdf ? "raw" : "image")}/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    const data = await response.json();
    if (!response.ok || !data?.secure_url) {
      throw new Error(data?.error?.message || "Upload failed");
    }

    return {
      secureUrl: data.secure_url,
      publicId: String(data.public_id || ""),
      resourceType: (signatureData.resourceType || (uploadPdf ? "raw" : "image")) as "image" | "raw",
    };
  } catch (error) {
    console.error('Cloudinary Upload Error:', error);
    throw error;
  }
}

export async function uploadToCloudinary(
  file: File,
  uploadOptions: UploadOptions = {},
) {
  const result = await uploadToCloudinaryDetailed(file, uploadOptions);
  return result.secureUrl;
}
