import type { Plugin as VitePlugin } from 'vite'
import type { Plugin as RollupPlugin } from 'rollup'
import createResolvePlugin from '@rollup/plugin-node-resolve'
import createEsbuildPlugin from 'rollup-plugin-esbuild'
import { terser } from 'rollup-plugin-terser'
import { recrawl } from 'recrawl-sync'
import chalk from 'chalk'
import etag from 'etag'
import path from 'path'
import fs from 'fs'
import { MimeType } from './serve/mime'
import { uploadScript } from './upload'
import { Config } from './config'

// The `serve` function is exported by "dist/index.mjs" only.
export type { serve } from './serve'

const namingRules = /^[a-z]([a-z0-9_-]{0,61}[a-z0-9])?$/i

export default (config: Config): VitePlugin => ({
  configureBuild(viteConfig, builds) {
    if (config.upload && !namingRules.test(config.upload.scriptId)) {
      throw Error(
        `Invalid "scriptId" for Cloudflare worker: "${config.upload.scriptId}"\n\n` +
          `  Script identifiers must:\n` +
          [
            `start with a letter`,
            `end with a letter or digit`,
            `include only letters, digits, underscore, and hyphen`,
            `be 63 or fewer characters`,
          ]
            .map(line => `    ➤ ` + line)
            .join('\n') +
          '\n'
      )
    }

    const authToken = config.upload
      ? config.upload.authToken || process.env.CLOUDFLARE_AUTH_TOKEN
      : null

    builds.push({
      write: !!config.dest && !authToken,
      input: config.main,
      output: {
        file: config.dest,
        format: 'cjs',
        entryFileNames:
          !config.dest && !authToken ? 'workers/[name].js' : undefined,
      },
      plugins: [
        createEsbuildPlugin({
          target: 'esnext',
          sourceMap: !!viteConfig.sourcemap,
          loaders: {
            '.ts': 'ts',
            '.js': 'js',
            '.mjs': 'js',
            '.json': 'json',
          },
        }),
        createResolvePlugin({
          extensions: ['.ts', '.mjs', '.js', '.json'],
        }),
        createServePlugin(
          path.resolve(viteConfig.root, viteConfig.outDir),
          config
        ),
        ...(config.plugins || []),
        config.minify !== false &&
          (terser(config.minify === true ? {} : config.minify) as any),
      ],
      async onResult(result) {
        if (config.upload) {
          if (!authToken) {
            return console.warn(
              chalk.yellow('[warn]') +
                ' Cannot upload Cloudflare worker without auth token\n'
            )
          }
          try {
            await uploadScript(result.assets[0].code, {
              ...config.upload,
              authToken,
            })
          } catch (err) {
            throw Error('Failed to upload Cloudflare worker. ' + err.message)
          }
        }
      },
    })
  },
})

function createServePlugin(root: string, config: Config): RollupPlugin {
  const crawl = recrawl({
    only: toArray(config.inlineGlobs),
  })

  const assetsId = '\0_worker_assets.js'
  const servePath = path.join(__dirname, 'index.mjs')
  return {
    name: 'vite-cloudflare-worker:serve',
    resolveId(id, parent) {
      if (id == './assets' && parent == servePath) {
        if (config.inlineGlobs) {
          return assetsId
        }
        throw Error(
          '[vite-cloudflare-worker] Must set "inlineGlobs" before using "serve" function'
        )
      }
    },
    load(id) {
      if (id == assetsId) {
        let lines = ['export default {']
        crawl(root, file =>
          lines.push(`  '${file}': ${inlineAsset(root, file, config)},`)
        )
        lines.push('}')
        return lines.join('\n')
      }
    },
  }
}

function inlineAsset(root: string, file: string, config: Config) {
  // Assume UTF-8 encoding.
  let text = fs.readFileSync(path.join(root, file), 'utf8')

  const mime = getMimeType(file)
  if (mime == MimeType.HTML && config.minifyHtml !== false)
    text = require('html-minifier').minify(text, {
      collapseWhitespace: true,
      ...(config.minifyHtml as any),
    })

  // Cache the byte length before escaping and after minifying.
  const numBytes = Buffer.from(text).byteLength

  // Escape any newlines or single quotes.
  text = text.replace(/(['\n\r])/g, ch => escapeMap[ch])

  // [etag, mime, numBytes, getText]
  return `['${etag(text)}', ${mime}, ${numBytes}, () => '${text}']`
}

const escapeMap: any = {
  '\n': '\\n',
  '\r': '\\r',
  '\'': '\\\'', // prettier-ignore
}

function getMimeType(file: string) {
  const ext = path.extname(file)
  return ext == '.html' ? MimeType.HTML : MimeType.TXT
}

function toArray<T>(arg: T): T extends void ? [] : T extends any[] ? T : T[] {
  return arg === void 0 ? [] : Array.isArray(arg) ? arg : ([arg] as any)
}
