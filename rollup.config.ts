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

// See https://github.com/actions/typescript-action/issues/1010 RE licenses.
// See https://github.com/actions/typescript-action/issues/1011 RE "sourcemap"

const config = {
  input: 'src/action.ts',
  output: {
    esModule: true,
    file: 'dist/action.js',
    format: 'es',
    sourcemap: true
  },
  plugins: [
    typescript({ sourceMap: true }),
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
    license({
      sourcemap: true,
      // Rather than include the text of all license in the action.js, just link
      // to the full list output separately and committed adjacent to action.js.
      banner: {
        commentStyle: 'regular',
        content: 'For licenses see https://github.com/Skenvy/dispatch-suggestor/blob/main/dist/licenses.txt'
      },
      // Output ALL licenses to ./dist/licenses.txt
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
