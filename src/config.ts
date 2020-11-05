import type { Plugin as RollupPlugin } from 'rollup'
import type { Options as HtmlMinifyOptions } from 'html-minifier'
import type { Options as TerserOptions } from 'rollup-plugin-terser'

export type Config = {
  /**
   * The worker's package root, relative to `root` in Vite config.
   *
   * The `package.json` and `wrangler.toml` files of this directory are
   * loaded if they exist.
   */
  root?: string
  /**
   * Entry module in JavaScript or TypeScript.
   *
   * Only required if `root` option is undefined.
   */
  main?: string
  /**
   * The bundled worker's filename, relative to `outDir` in Vite config.
   *
   * When the `upload` option is defined, this defaults to undefined.
   *
   * @default "workers/[name].js"
   */
  dest?: string
  /**
   * Custom plugins to apply after the default plugins.
   */
  plugins?: RollupPlugin[]
  /**
   * Matching files are bundled with the script, and served
   * by the `serve` function exported by this plugin.
   *
   * Globs are relative to the `outDir` in Vite config.
   */
  inlineGlobs?: string | string[]
  /**
   * Control how the script is minified.
   * @default true
   */
  minify?: TerserOptions | boolean
  /**
   * Control how `.html` modules are minified.
   * @default true
   */
  minifyHtml?: HtmlMinifyOptions | boolean
  /**
   * Upload the bundled worker after a successful build, using the
   * Cloudflare API.
   *
   * When `true`, the `root` option must be defined and its
   * `wrangler.toml` file must contain `name` and `account_id`.
   */
  upload?: UploadConfig | boolean
}

export type UploadConfig = {
  /**
   * The script identifier on Cloudflare.
   */
  scriptId: string
  /**
   * The account identifier on Cloudflare.
   */
  accountId: string
  /**
   * Passed in `Authorization` header to Cloudflare API
   * @default process.env.CLOUDFLARE_AUTH_TOKEN
   */
  authToken?: string
}
