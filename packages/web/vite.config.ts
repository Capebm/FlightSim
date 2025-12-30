import { defineConfig, loadEnv } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import react from '@vitejs/plugin-react'

const cesiumSource = 'node_modules/cesium/Build/Cesium'
const cesiumBaseUrl = 'cesium'

export default defineConfig(({ mode }) => {
    // Useful for GitHub Pages deployments where the app is served under a subpath:
    // e.g. VITE_BASE_PATH="/cesium-flight-simulator/"
    const env = loadEnv(mode, process.cwd(), '')
    const rawBase = env.VITE_BASE_PATH || '/'
    const base = rawBase === '/' ? '/' : rawBase.endsWith('/') ? rawBase : `${rawBase}/`

    return {
        base,
        plugins: [
            react(),
            viteStaticCopy({
                targets: [
                    { src: `${cesiumSource}/Workers`, dest: cesiumBaseUrl },
                    { src: `${cesiumSource}/ThirdParty`, dest: cesiumBaseUrl },
                    { src: `${cesiumSource}/Assets`, dest: cesiumBaseUrl },
                    { src: `${cesiumSource}/Widgets`, dest: cesiumBaseUrl },
                ],
            }),
        ],
        define: {
            CESIUM_BASE_URL: JSON.stringify(cesiumBaseUrl),
        },
    }
})