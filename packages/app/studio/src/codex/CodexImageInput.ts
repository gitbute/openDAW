import {isDefined, Nullable} from "@opendaw/lib-std"

export namespace CodexImageInput {
    export const MaxSide = 2048
    export const MaxImages = 8
    export const MaxPngBytes = 2_000_000

    export const filesOf = (data: Nullable<DataTransfer>): ReadonlyArray<File> =>
        isDefined(data) ? Array.from(data.files).filter(file => file.type.startsWith("image/")) : []

    const dataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === "string"
            ? resolve(reader.result) : reject(new Error("Image could not be read"))
        reader.onerror = () => reject(reader.error ?? new Error("Image could not be read"))
        reader.readAsDataURL(blob)
    })

    export const encode = async (file: Blob): Promise<string> => {
        const bitmap = await createImageBitmap(file)
        const scale = Math.min(1, MaxSide / Math.max(bitmap.width, bitmap.height))
        const width = Math.max(1, Math.round(bitmap.width * scale))
        const height = Math.max(1, Math.round(bitmap.height * scale))
        const canvas = new OffscreenCanvas(width, height)
        const context = canvas.getContext("2d")
        if (!isDefined(context)) {
            bitmap.close()
            throw new Error("No 2d context to encode the image")
        }
        context.drawImage(bitmap, 0, 0, width, height)
        bitmap.close()
        const png = await canvas.convertToBlob({type: "image/png"})
        return dataUrl(png.size <= MaxPngBytes ? png : await canvas.convertToBlob({type: "image/jpeg", quality: 0.9}))
    }
}
