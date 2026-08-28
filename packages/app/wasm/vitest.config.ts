import {defineConfig} from "vitest/config"

// Parity harness runs in node (loads wasm + reads built artifacts; no DOM needed). Kept off the
// default `turbo test` run via the `test:parity` script so the main test suite stays Rust-free.
export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["src/**/*.test.ts", "test/**/*.test.ts"],
        // The parity suite contains real-time performance checks and heavyweight audio renders.
        // Running files concurrently makes those checks depend on scheduler load instead of the
        // engine, especially on Windows. Keep the suite deterministic; individual tests still run normally.
        fileParallelism: false
    },
    esbuild: {
        target: "ESNext"
    }
})
