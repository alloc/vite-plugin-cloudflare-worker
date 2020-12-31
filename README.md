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

### Install

```sh
yarn add -D vite-plugin-cloudflare-worker@next
```

### Configuration

- `main?: string`  
  The entry module in JavaScript or TypeScript.

- `root?: string`  
  The root directory of the worker.  

  This option is useful when your worker has its own `package.json` and 
  `worker.toml` files. The `main` option is inferred from its `package.json` 
  file, and the `upload` option is inferred from its `worker.toml` file.  

  If `main` is undefined, this option is required.

- `dest?: string`  
  The bundle filename, relative to `outDir` in Vite config.  

  Defaults to `workers/[name].js` unless `upload` is defined (in which case,
  nothing is saved to disk when `dest` is undefined).

- `plugins?: RollupPlugin[]`  
  Custom plugins to apply after the default plugins (but before minifying).

- `serveGlobs?: string[] | { [root: string]: string[] }`  
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
