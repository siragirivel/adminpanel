declare module "uzip" {
  const UZIP: {
    encode: (files: Record<string, Uint8Array>) => ArrayBuffer;
  };

  export default UZIP;
}
