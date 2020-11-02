import type { Plugin as RollupPlugin } from 'rollup'
import type { Options as HtmlMinifyOptions } from 'html-minifier'
import type { Options as TerserOptions } from 'rollup-plugin-terser'

export type Config = {
  /**
   * Entry module in JavaScript or TypeScript.
   */
  main: string
  /**
   * Script filename relative to `outDir` in Vite config.
   *
   * When `upload` is defined, this option has no default value.
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
   * When defined, the worker is uploaded after a successful build.
   */
  upload?: UploadConfig
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
