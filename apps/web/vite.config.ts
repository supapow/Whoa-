import { defineConfig, type Plugin } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

function googleFontProxyPlugin(): Plugin {
  const fontCache = new Map<string, Buffer>()
  return {
    name: 'google-font-proxy',
    configureServer(server) {
      server.middlewares.use('/api/font-file', async (req, res) => {
        try {
          const url = new URL(req.url || '', 'http://localhost')
          const family = url.searchParams.get('family')?.trim()
          const weight = parseInt(url.searchParams.get('weight') || '400', 10)
          if (!family) {
            res.statusCode = 400
            res.end('Missing family parameter')
            return
          }

          const cacheKey = `${family.toLowerCase()}__${weight}`
          if (fontCache.has(cacheKey)) {
            const buf = fontCache.get(cacheKey)!
            res.setHeader('Content-Type', 'font/ttf')
            res.setHeader('Cache-Control', 'public, max-age=86400')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(buf)
            return
          }

          const famParam = family.replace(/\s+/g, '+')
          const cssUrl = `https://fonts.googleapis.com/css2?family=${famParam}:wght@${weight}`
          const cssRes = await fetch(cssUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Linux; U; Android 4.3; en-us; SM-N900T Build/JSS15J) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
            },
          })

          if (!cssRes.ok) {
            res.statusCode = 404
            res.end('Font not found on Google Fonts')
            return
          }

          const css = await cssRes.text()
          const match =
            css.match(/src:\s*url\((https:\/\/[^)]+\.ttf)\)/i) ||
            css.match(/src:\s*url\((https:\/\/[^)]+)\)\s*format\(['"]?truetype['"]?\)/i)

          if (!match || !match[1]) {
            res.statusCode = 404
            res.end('TTF url not found in Google CSS')
            return
          }

          const ttfRes = await fetch(match[1])
          if (!ttfRes.ok) {
            res.statusCode = 502
            res.end('Failed to fetch font binary')
            return
          }

          const arrayBuf = await ttfRes.arrayBuffer()
          const buf = Buffer.from(arrayBuf)
          fontCache.set(cacheKey, buf)

          res.setHeader('Content-Type', 'font/ttf')
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(buf)
        } catch (err: any) {
          res.statusCode = 500
          res.end(err?.message || 'Internal error')
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [viteReact(), tailwindcss(), googleFontProxyPlugin()],
  resolve: {
    alias: {
      '#': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: true,
    hmr: { clientPort: 443, protocol: 'wss' },
  },
})
