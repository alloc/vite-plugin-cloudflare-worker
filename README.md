# vite-plugin-cloudflare-worker

Generate a bundle that runs as a [Cloudflare worker][1], then write it to disk
and/or upload it directly to Cloudflare.

The bundle is minified by default.

[1]: https://developers.cloudflare.com/workers/

```ts
import workerPlugin from 'vite-plugin-cloudflare-worker'

export default {
  plugins: [
    // Make sure this is last.
    workerPlugin({
      main: 'workers/foo.ts',
    }),
  ]
}
```

See the [`2.0` branch][2] for Vite 2 compatible docs.

[2]: https://github.com/alloc/vite-plugin-cloudflare-worker/tree/2.0

### Configuration

- `main: string`  
  The entry module in JavaScript or TypeScript.

- `dest?: string`  
  The bundle filename, relative to `outDir` in Vite config.  
  Defaults to `workers/[name].js` unless `upload` is defined (in which case,
  nothing is saved to disk when `dest` is undefined).

- `plugins?: RollupPlugin[]`  
  Custom plugins to apply after the default plugins (but before minifying).

- `inlineGlobs?: string | string[]`  
  Matching files are bundled with the script. Use the `serve` function (exported
  by this plugin) in your script to easily serve the bundled content with the
  proper response headers (`ETag`, `Content-Type`, `Content-Length`).

- `minify?: object | boolean`  
  Customize how the script is minified, or pass `false` to disable minification.

- `minifyHtml?: object | boolean`  
  Customize how inlined `.html` modules are minified, or pass `false` to disable.

- `upload?: UploadConfig`  
  When defined, the worker is uploaded after a successful build.  
  The `UploadConfig` type contains these values:  
    - `scriptId: string` (any name you like)
    - `accountId: string` (found on the homepage of your Cloudflare account)
    - `authToken?: string` (defaults to `process.env.CLOUDFLARE_AUTH_TOKEN`)

