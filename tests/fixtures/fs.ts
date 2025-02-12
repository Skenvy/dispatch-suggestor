import { default as fs, PathLike as _PathLike } from 'fs'
import { jest } from '@jest/globals'

export const readdirSync = jest.fn<typeof fs.readdirSync>()
export const statSync = jest.fn<typeof fs.statSync>()
export type PathLike = _PathLike
