import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { ClientRequest, IncomingMessage, ServerResponse } from 'http'

const TRIP_MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const TRIP_NAV_GUARD = `<script>(function(){var P="/trip-proxy",T="https://sg.trip.com";function M(u){try{var s=String(u);if(s.indexOf("sg.trip.com")>-1)return s.replace(/https?:\\/\\/sg\\.trip\\.com/g,location.origin+P);if(s.indexOf("apigateway.ctripcorp.com")>-1)return s.replace(/https?:\\/\\/apigateway\\.ctripcorp\\.com\\/restapi\\//g,"/restapi/");if(s.indexOf("//sg.trip.com")===0)return s.replace("//sg.trip.com",location.origin+P);}catch(e){}return u;}var a=location.assign.bind(location);location.assign=function(u){return a(M(u));};var r=location.replace.bind(location);location.replace=function(u){return r(M(u));};var f=window.fetch;window.fetch=function(i,o){o=o||{};if(o.credentials==null)o.credentials="same-origin";if(typeof i==="string"){i=M(i);}else if(i&&typeof i==="object"&&"url"in i){var u=M(i.url);if(u!==i.url)i=new Request(u,i);}return f.call(this,i,o)};var xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){arguments[1]=M(u);return xo.apply(this,arguments)};})();</script>`

function normalizeSetCookie(cookie: string, host?: string) {
  return cookie
    .replace(/;\s*Domain=[^;]*/gi, '')
    .replace(/;\s*Secure/gi, host?.startsWith('localhost') ? '' : '; Secure')
}

function rewriteProxyHeaders(
  headers: IncomingMessage['headers'],
  host?: string,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  const cookies: string[] = []

  for (const [key, value] of Object.entries(headers)) {
    if (!value) continue
    const lower = key.toLowerCase()
    if (['content-encoding', 'transfer-encoding', 'content-length'].includes(lower)) continue

    if (lower === 'set-cookie') {
      const values = Array.isArray(value) ? value : [value]
      cookies.push(...values.map((cookie) => normalizeSetCookie(cookie, host)))
      continue
    }

    out[key] = value
  }

  if (cookies.length) out['set-cookie'] = cookies
  return out
}

function rewriteTripHtml(body: string, host: string): string {
  const proxyBase = `http://${host}/trip-proxy`
  let out = body
    .replace(/https:\/\/sg\.trip\.com/g, proxyBase)
    .replace(/http:\/\/sg\.trip\.com/g, proxyBase)
    .replace(/https:\/\/apigateway\.ctripcorp\.com\/restapi\//g, '/restapi/')
    .replace(/http:\/\/apigateway\.ctripcorp\.com\/restapi\//g, '/restapi/')
    .replace(/\/\/sg\.trip\.com/g, `//${host}/trip-proxy`)
    .replace(new RegExp(`https?://${host.replace(/\./g, '\\.')}/trip-proxy/restapi/`, 'g'), '/restapi/')
    .replace(/(["'])\/api\/soa2\//g, `$1/restapi/soa2/`)

  if (out.includes('<head>')) {
    out = out.replace('<head>', `<head>${TRIP_NAV_GUARD}`)
  } else if (out.includes('</head>')) {
    out = out.replace('</head>', `${TRIP_NAV_GUARD}</head>`)
  }

  return out
}

function applyTripUpstreamHeaders(proxyReq: ClientRequest, req?: IncomingMessage) {
  proxyReq.setHeader('User-Agent', TRIP_MOBILE_UA)
  proxyReq.setHeader('Sec-CH-UA-Mobile', '?1')
  proxyReq.setHeader('Accept-Encoding', 'identity')
  proxyReq.setHeader('Origin', 'https://sg.trip.com')
  proxyReq.setHeader('Referer', 'https://sg.trip.com/')

  const cookie = req?.headers.cookie
  if (cookie) proxyReq.setHeader('Cookie', cookie)
}

function configureTripApiProxy(proxy: {
  on: (event: 'proxyReq' | 'proxyRes', listener: (...args: unknown[]) => void) => void
}) {
  proxy.on('proxyReq', (...args: unknown[]) => {
    const proxyReq = args[0] as ClientRequest
    const req = args[1] as IncomingMessage | undefined
    applyTripUpstreamHeaders(proxyReq, req)
  })

  proxy.on('proxyRes', (...args: unknown[]) => {
    const proxyRes = args[0] as IncomingMessage
    const req = args[1] as IncomingMessage
    const res = args[2] as ServerResponse
    const host = req.headers.host || 'localhost:5173'
    const headers = rewriteProxyHeaders(proxyRes.headers, host)
    res.writeHead(proxyRes.statusCode || 502, headers)
    proxyRes.pipe(res)
  })
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
          proxy.on('proxyReq', (proxyReq: ClientRequest, req: IncomingMessage) => {
            applyTripUpstreamHeaders(proxyReq, req)
          })
          proxy.on(
            'proxyRes',
            (proxyRes: IncomingMessage, req: IncomingMessage, res: ServerResponse) => {
              const host = req.headers.host || 'localhost:5173'
              const contentType = String(proxyRes.headers['content-type'] || '')
              const headers = rewriteProxyHeaders(proxyRes.headers, host)

              if (!contentType.includes('text/html')) {
                res.writeHead(proxyRes.statusCode || 502, headers)
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
                const body = rewriteTripHtml(Buffer.concat(chunks).toString('utf8'), host)
                headers['content-length'] = String(Buffer.byteLength(body))
                res.writeHead(proxyRes.statusCode || 200, headers)
                res.end(body)
              })
            },
          )
        },
      },
      '/restapi': {
        target: 'https://sg.trip.com',
        changeOrigin: true,
        selfHandleResponse: true,
        configure: configureTripApiProxy,
      },
      '/api/soa2': {
        target: 'https://sg.trip.com',
        changeOrigin: true,
        selfHandleResponse: true,
        rewrite: (path) => path.replace(/^\/api\/soa2/, '/restapi/soa2'),
        configure: configureTripApiProxy,
      },
    },
  },
})
