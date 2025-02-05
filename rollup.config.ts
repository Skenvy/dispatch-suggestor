// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

import license from 'rollup-plugin-license'
// A ridiculous amount of extra steps to get the current directory path.
import path from 'path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const config = {
  input: 'src/index.ts',
  output: {
    esModule: true,
    file: 'dist/index.js',
    format: 'es',
    sourcemap: true
  },
  plugins: [
    typescript({ sourceMap: true }),
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
    license({
      sourcemap: true,
      banner: {
        commentStyle: 'regular',
        content: 'For licenses see https://github.com/Skenvy/dispatch-suggestor/blob/main/dist/licenses.txt'
      },
      thirdParty: {
        includePrivate: true,
        includeSelf: true,
        multipleVersions: true,
        output: {
          file: path.join(__dirname, 'dist', 'licenses.txt'),
          encoding: 'utf-8'
        }
      }
    })
  ]
}

export default config
