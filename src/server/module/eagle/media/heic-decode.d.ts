declare module 'heic-decode' {
  interface DecodedImage {
    width: number
    height: number
    data: Uint8ClampedArray
  }
  interface Image {
    width: number
    height: number
    decode(): Promise<DecodedImage>
  }
  interface Images extends Array<Image> {
    dispose(): void
  }
  const decode: {
    (options: { buffer: Uint8Array }): Promise<DecodedImage>
    all(options: { buffer: Uint8Array }): Promise<Images>
  }
  export default decode
}

declare module 'libheif-js/wasm-bundle' {
  interface Context {
    delete(): void
  }
  const libheif: {
    ready?: Promise<unknown>
    heif_context_alloc(): Context
    heif_context_read_from_memory(
      context: Context,
      buffer: Uint8Array,
    ): { code: { value: number }; message: string }
    heif_context_get_number_of_top_level_images(context: Context): number
  }
  export default libheif
}
