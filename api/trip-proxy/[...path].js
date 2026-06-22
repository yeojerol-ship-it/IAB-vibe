const TRIP_ORIGIN = 'https://sg.trip.com'
const TRIP_MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const NAV_GUARD = `<script>(function(){var P="/trip-proxy",T="https://sg.trip.com";function M(u){try{var s=String(u);if(s.indexOf("sg.trip.com")>-1)return s.replace(/https?:\\/\\/sg\\.trip\\.com/g,location.origin+P);if(s.indexOf("apigateway.ctripcorp.com")>-1)return s.replace(/https?:\\/\\/apigateway\\.ctripcorp\\.com\\/restapi\\//g,"/restapi/");if(s.indexOf("//sg.trip.com")===0)return s.replace("//sg.trip.com",location.origin+P);}catch(e){}return u;}var a=location.assign.bind(location);location.assign=function(u){return a(M(u));};var r=location.replace.bind(location);location.replace=function(u){return r(M(u));};var f=window.fetch;window.fetch=function(i,o){o=o||{};if(o.credentials==null)o.credentials="same-origin";if(typeof i==="string"){i=M(i);}else if(i&&typeof i==="object"&&"url"in i){var u=M(i.url);if(u!==i.url)i=new Request(u,i);}return f.call(this,i,o)};var xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){arguments[1]=M(u);return xo.apply(this,arguments)};document.addEventListener("click",function(e){var n=e.target&&e.target.closest&&e.target.closest("a[href]");if(!n)return;var h=n.getAttribute("href");var m=M(h);if(m!==h){e.preventDefault();location.assign(m);}},true);})();</script>`

function getProxyBase(req) {
  const proto =
    req.headers['x-forwarded-proto'] ||
    (req.headers.host?.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${req.headers.host}/trip-proxy`
}

function rewriteTripUrl(value, proxyBase) {
  return String(value)
    .replace(/https:\/\/sg\.trip\.com/g, proxyBase)
    .replace(/http:\/\/sg\.trip\.com/g, proxyBase)
    .replace(/https:\/\/apigateway\.ctripcorp\.com/g, proxyBase)
    .replace(/http:\/\/apigateway\.ctripcorp\.com/g, proxyBase)
    .replace(/\/\/sg\.trip\.com/g, proxyBase)
}

function rewriteHtml(html, proxyBase) {
  const host = proxyBase.replace(/^https?:\/\//, '').replace(/\/trip-proxy$/, '')
  let out = rewriteTripUrl(html, proxyBase)
    .replace(/https:\/\/apigateway\.ctripcorp\.com\/restapi\//g, '/restapi/')
    .replace(/http:\/\/apigateway\.ctripcorp\.com\/restapi\//g, '/restapi/')
    .replace(new RegExp(`https?://${host.replace(/\./g, '\\.')}/trip-proxy/restapi/`, 'g'), '/restapi/')
    .replace(/(["'])\/api\/soa2\//g, `$1/restapi/soa2/`)

  if (out.includes('<head>')) {
    out = out.replace('<head>', `<head>${NAV_GUARD}`)
  } else if (out.includes('</head>')) {
    out = out.replace('</head>', `${NAV_GUARD}</head>`)
  }

  return out
}

function normalizeSetCookie(cookie, host) {
  return cookie
    .replace(/;\s*Domain=[^;]*/gi, '')
    .replace(/;\s*Secure/gi, host?.startsWith('localhost') ? '' : '; Secure')
}

async function readRequestBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  const path = Array.isArray(req.query.path)
    ? req.query.path.join('/')
    : req.query.path || ''
  const queryIndex = req.url.indexOf('?')
  const query = queryIndex >= 0 ? req.url.slice(queryIndex) : ''
  const targetUrl = `${TRIP_ORIGIN}/${path}${query}`
  const proxyBase = getProxyBase(req)

  const requestHeaders = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue
    const lower = key.toLowerCase()
    if (
      ['host', 'connection', 'content-length', 'accept-encoding'].includes(lower)
    ) {
      continue
    }
    requestHeaders.set(key, Array.isArray(value) ? value.join(', ') : String(value))
  }
  requestHeaders.set('user-agent', TRIP_MOBILE_UA)
  requestHeaders.set('sec-ch-ua-mobile', '?1')
  requestHeaders.set('origin', TRIP_ORIGIN)
  requestHeaders.set('referer', `${TRIP_ORIGIN}/`)
  requestHeaders.set('accept-encoding', 'identity')

  const requestBody = ['GET', 'HEAD'].includes(req.method)
    ? undefined
    : await readRequestBody(req)

  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers: requestHeaders,
    body: requestBody,
    redirect: 'manual',
  })

  res.statusCode = upstream.status

  const skipHeaders = new Set([
    'content-encoding',
    'content-length',
    'transfer-encoding',
    'content-security-policy',
    'x-frame-options',
    'strict-transport-security',
    'set-cookie',
  ])

  upstream.headers.forEach((value, key) => {
    if (skipHeaders.has(key.toLowerCase())) return

    if (key.toLowerCase() === 'location') {
      res.setHeader('location', rewriteTripUrl(value, proxyBase))
      return
    }

    res.setHeader(key, value)
  })

  const cookies = upstream.headers.getSetCookie?.() ?? []
  if (cookies.length) {
    for (const cookie of cookies) {
      res.appendHeader('set-cookie', normalizeSetCookie(cookie, req.headers.host))
    }
  } else {
    const single = upstream.headers.get('set-cookie')
    if (single) {
      res.setHeader('set-cookie', normalizeSetCookie(single, req.headers.host))
    }
  }

  const contentType = upstream.headers.get('content-type') || ''
  if (contentType.includes('text/html')) {
    const html = await upstream.text()
    res.setHeader('content-type', contentType)
    res.end(rewriteHtml(html, proxyBase))
    return
  }

  const buffer = Buffer.from(await upstream.arrayBuffer())
  res.end(buffer)
}
