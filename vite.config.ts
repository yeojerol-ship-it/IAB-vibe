import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { ClientRequest, IncomingMessage, ServerResponse } from 'http'

const TRIP_MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const TRIP_NAV_GUARD = `<script>(function(){var P="/trip-proxy";function M(u){try{var s=String(u);if(s.indexOf("sg.trip.com")>-1)return s.replace(/https?:\\/\\/sg\\.trip\\.com/g,location.origin+P);}catch(e){}return u;}var a=location.assign.bind(location);location.assign=function(u){return a(M(u));};var r=location.replace.bind(location);location.replace=function(u){return r(M(u));};})();</script>`

function rewriteTripHtml(body: string, host: string): string {
  const proxyBase = `http://${host}/trip-proxy`
  let out = body
    .replace(/https:\/\/sg\.trip\.com/g, proxyBase)
    .replace(/http:\/\/sg\.trip\.com/g, proxyBase)
    .replace(/\/\/sg\.trip\.com/g, `//${host}/trip-proxy`)

  if (out.includes('</head>')) {
    out = out.replace('</head>', `${TRIP_NAV_GUARD}</head>`)
  }
  return out
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/trip-proxy': {
        target: 'https://sg.trip.com',
        changeOrigin: true,
        selfHandleResponse: true,
        rewrite: (path) => path.replace(/^\/trip-proxy/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq: ClientRequest) => {
            proxyReq.setHeader('User-Agent', TRIP_MOBILE_UA)
            proxyReq.setHeader('Sec-CH-UA-Mobile', '?1')
            proxyReq.setHeader('Accept-Encoding', 'identity')
          })
          proxy.on(
            'proxyRes',
            (proxyRes: IncomingMessage, req: IncomingMessage, res: ServerResponse) => {
              const contentType = String(proxyRes.headers['content-type'] || '')
              if (!contentType.includes('text/html')) {
                res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
                proxyRes.pipe(res)
                return
              }

              const chunks: Buffer[] = []
              proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk))
              proxyRes.on('error', () => {
                if (!res.headersSent) res.writeHead(502)
                res.end()
              })
              proxyRes.on('end', () => {
                const host = req.headers.host || 'localhost:5173'
                const body = rewriteTripHtml(Buffer.concat(chunks).toString('utf8'), host)
                const headers = { ...proxyRes.headers }
                delete headers['content-length']
                delete headers['content-encoding']
                headers['content-length'] = String(Buffer.byteLength(body))
                res.writeHead(proxyRes.statusCode || 200, headers)
                res.end(body)
              })
            },
          )
        },
      },
    },
  },
})
