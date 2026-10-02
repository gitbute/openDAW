import {int, isDefined} from "@opendaw/lib-std"
import {FFT, Window} from "@opendaw/lib-dsp"

/** Shared FFT instances and analysis windows per size (windows are read-only). */
export namespace FftCache {
    const ffts = new Map<int, FFT>()
    const windows = new Map<string, Float32Array>()

    export const ceilPow2 = (value: number): int => 1 << Math.ceil(Math.log2(Math.max(2, value)))

    export const fft = (size: int): FFT => {
        const existing = ffts.get(size)
        if (isDefined(existing)) {return existing}
        const created = new FFT(size)
        ffts.set(size, created)
        return created
    }

    export const window = (type: Window.Type, size: int): Float32Array => {
        const key = `${type}:${size}`
        const existing = windows.get(key)
        if (isDefined(existing)) {return existing}
        const created = Window.create(type, size)
        windows.set(key, created)
        return created
    }
}
