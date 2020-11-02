import { getContentType } from './mime'
import assets from './assets'

/**
 * Serve a bundled asset. The `If-None-Match` request header is respected,
 * and the following response headers are included: `ETag`, `Content-Type`,
 * and `Content-Length`.
 *
 * Returns a `Response` when a matching file is found.
 */
export function serve(url: string, headers: Headers) {
  const asset = assets[url]
  if (asset) {
    if (asset[0] !== headers.get('if-none-match')) {
      return new Response(asset[3](), {
        headers: {
          etag: asset[0],
          'content-type': getContentType(asset[1]),
          'content-length': '' + asset[2],
        },
      })
    }

    // Not modified.
    return new Response(null, { status: 304 })
  }
}
