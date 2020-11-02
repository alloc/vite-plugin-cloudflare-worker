import dts from 'rollup-plugin-dts'
import typescript from '@rollup/plugin-typescript'

const bundle = (input, output, format) => ({
  input,
  output: {
    file: output,
    format,
    exports: 'named',
    sourcemap: true,
    sourcemapExcludeSources: true,
  },
  plugins: [typescript()],
  external: id => !/^[./]/.test(id) || id == './assets',
})

const dtsBundle = (input, output) => ({
  input,
  output: {
    file: output.replace('.js', '.d.ts'),
    format: 'esm',
  },
  plugins: [dts()],
})

const { main } = require('./package.json')

export default [
  bundle('src/plugin.ts', main, 'cjs'),
  bundle('src/serve/index.ts', main.replace('.js', '.mjs'), 'esm'),
  dtsBundle('src/plugin.ts', main),
]
