if (!Reflect.has(globalThis, "AudioWorkletNode")) {
    Reflect.set(globalThis, "AudioWorkletNode", class {})
}
