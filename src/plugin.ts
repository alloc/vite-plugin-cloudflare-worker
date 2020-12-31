import type { Plugin as VitePlugin } from 'vite'
import type { Plugin as RollupPlugin, InputOption, OutputChunk } from 'rollup'
import createResolvePlugin from '@rollup/plugin-node-resolve'
import createEsbuildPlugin from 'rollup-plugin-esbuild'
import { terser } from 'rollup-plugin-terser'
import { crawl } from 'recrawl-sync'
import { rollup } from 'rollup'
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
  name: 'vite:cloudflare-worker',
  enforce: 'post',
  configResolved(viteConfig) {
    let input: InputOption | undefined = config.main
    if (config.root) {
      config.root = path.resolve(viteConfig.root, config.root)

      // Infer the "input" module from package.json
      if (!input) {
        const workerPkgPath = path.join(config.root, 'package.json')

        if (!fs.existsSync(workerPkgPath))
          throw PluginError(
            `The "main" option must be defined if no package.json exists`
          )

        const workerPkg = JSON.parse(fs.readFileSync(workerPkgPath, 'utf8'))
        config.main = findFile(config.root, [
          workerPkg.main,
          'index.ts',
          'index.js',
        ])

        if (!config.main)
          throw PluginError(
            `The "main" module from package.json could not be found`
          )

        input = path.join(config.root, config.main)
        if (!config.dest) {
          const name = path.basename(config.root)
          input = { [name]: input }
        }
      }

      if (config.upload === true) {
        const workerInfoPath = path.join(config.root, 'wrangler.toml')

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
      if (!input) {
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

    let workerChunk: OutputChunk
    this.generateBundle = async (_, bundle) => {
      const viteBuild = viteConfig.build

      const workerBundle = await rollup({
        input,
        plugins: [
          createEsbuildPlugin({
            target: 'esnext',
            sourceMap: !!viteBuild.sourcemap,
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
          createServePlugin(viteBuild.outDir, config),
          ...(config.plugins || []),
          config.minify !== false &&
            (terser(config.minify === true ? {} : config.minify) as any),
        ],
      })

      const { output } = await workerBundle.generate({
        file: config.dest,
        format: 'cjs',
        entryFileNames:
          !config.dest && !uploadConfig ? 'workers/[name].js' : undefined,
        sourcemap: viteBuild.sourcemap,
      })

      workerChunk = output[0]
      if (config.dest || !uploadConfig) {
        bundle[workerChunk.fileName] = workerChunk
      }
    }

    this.buildEnd = async error => {
      if (!error && uploadConfig) {
        if (!authToken)
          return viteConfig.logger.warn(
            'Cannot upload Cloudflare worker without auth token'
          )

        const { scriptId } = uploadConfig
        viteConfig.logger.info(
          `Cloudflare worker "${scriptId}" is being uploaded...`
        )

        try {
          await uploadScript(workerChunk.code, {
            ...uploadConfig,
            authToken,
          })
          viteConfig.logger.info(
            `Cloudflare worker "${scriptId}" was uploaded!`
          )
        } catch (err) {
          viteConfig.logger.error(
            `Cloudflare worker "${scriptId}" failed to upload. ` + err.message
          )
        }
      }
    }
  },
})

function createServePlugin(outDir: string, config: Config): RollupPlugin {
  const { serveGlobs } = config
  const globsByRoot = Array.isArray(serveGlobs)
    ? { [outDir]: serveGlobs }
    : serveGlobs || {}

  // Both the `outDir` (from vite.config.js) and worker-specific `root` option
  // are searched for paths matching the `serveGlobs` array.
  if (config.root && Array.isArray(serveGlobs)) {
    globsByRoot[config.root] = serveGlobs
  }

  const assetsId = '\0_worker_assets.js'
  const servePath = path.join(__dirname, 'index.mjs')
  return {
    name: 'vite-cloudflare-worker:serve',
    resolveId(id, parent) {
      if (id == './assets' && parent == servePath) {
        if (serveGlobs) {
          return assetsId
        }
        throw Error(
          '[vite-cloudflare-worker] Must set "serveGlobs" before using "serve" function'
        )
      }
    },
    load(id) {
      if (id == assetsId) {
        let lines = ['export default {']
        for (const root in globsByRoot) {
          crawl(path.resolve(outDir, root), {
            only: globsByRoot[root],
          }).forEach(file =>
            lines.push(`  '${file}': ${inlineAsset(root, file, config)},`)
          )
        }
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

function findFile(root: string, names: string[]) {
  return names.find(name => fs.existsSync(path.join(root, name)))
}

function PluginError(msg: string) {
  return Error('[vite-cloudflare-worker] ' + msg)
}
