import type { Plugin as VitePlugin } from 'vite'
import type { Plugin as RollupPlugin } from 'rollup'
import createResolvePlugin from '@rollup/plugin-node-resolve'
import createEsbuildPlugin from 'rollup-plugin-esbuild'
import { terser } from 'rollup-plugin-terser'
import { recrawl } from 'recrawl-sync'
import toml from 'toml'
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
  configureBuild(ctx) {
    if (config.root) {
      const workerDir = path.resolve(ctx.root, config.root)

      if (!config.main) {
        const workerPkgPath = path.join(workerDir, 'package.json')

        if (!fs.existsSync(workerPkgPath))
          throw PluginError(
            `The "main" option must be defined if no package.json exists`
          )

        const workerPkg = JSON.parse(fs.readFileSync(workerPkgPath, 'utf8'))
        config.main = findFile(workerDir, [
          workerPkg.main,
          'index.ts',
          'index.js',
        ])

        if (!config.main)
          throw PluginError(
            `The "main" module from package.json could not be found`
          )
      }

      if (config.upload === true) {
        const workerInfoPath = path.join(workerDir, 'wrangler.toml')

        if (!fs.existsSync(workerInfoPath))
          throw PluginError(`Cannot find wrangler.toml`)

        const {
          name: scriptId,
          account_id: accountId,
          type: workerType,
        } = toml.parse(fs.readFileSync(workerInfoPath, 'utf8'))

        if (!scriptId) {
          throw PluginError(`Missing "name" in wrangler.toml`)
        }
        if (!accountId) {
          throw PluginError(`Missing "account_id" in wrangler.toml`)
        }
        if (workerType && workerType !== 'javascript') {
          throw PluginError(`Unsupported worker type: "${workerType}"`)
        }

        config.upload = { scriptId, accountId }
      }
    } else {
      if (!config.main) {
        throw PluginError(`Expected "main" or "root" option to be defined`)
      }
      if (config.upload === true) {
        throw PluginError(`Cannot use "upload: true" without "root" option`)
      }
    }

    const uploadConfig = config.upload
    if (uploadConfig && !namingRules.test(uploadConfig.scriptId))
      throw PluginError(
        `Invalid name for Cloudflare worker: "${uploadConfig.scriptId}"\n\n` +
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

    const authToken = uploadConfig
      ? uploadConfig.authToken || process.env.CLOUDFLARE_AUTH_TOKEN
      : null

    let script: string
    ctx.afterAll(async () => {
      if (uploadConfig) {
        if (!authToken)
          return ctx.log.warn(
            'Cannot upload Cloudflare worker without auth token'
          )

        const { scriptId } = uploadConfig
        const uploading = ctx.log.start(
          `Cloudflare worker "${scriptId}" is being uploaded...`
        )
        try {
          await uploadScript(script, {
            ...uploadConfig,
            authToken,
          })
          uploading.done(`Cloudflare worker "${scriptId}" was uploaded!`)
        } catch (err) {
          uploading.fail(
            `Cloudflare worker "${scriptId}" failed to upload. ` + err.message
          )
        }
      }
    })

    ctx.build({
      write: !!config.dest,
      input: config.main,
      output: {
        file: config.dest,
        format: 'cjs',
        entryFileNames:
          !config.dest && !uploadConfig ? 'workers/[name].js' : undefined,
      },
      plugins: [
        createEsbuildPlugin({
          target: 'esnext',
          sourceMap: !!ctx.sourcemap,
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
        createServePlugin(ctx.outDir, config),
        ...(config.plugins || []),
        config.minify !== false &&
          (terser(config.minify === true ? {} : config.minify) as any),
      ],
      async onResult(result) {
        script = result.assets[0].code
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

function findFile(root: string, names: string[]) {
  return names.find(name => fs.existsSync(path.join(root, name)))
}

function PluginError(msg: string) {
  return Error('[vite-cloudflare-worker] ' + msg)
}
