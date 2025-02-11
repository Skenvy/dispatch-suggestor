'use strict'

const fs = jest.createMockFromModule('fs')

// This is a custom function that our tests can use during setup to specify
// what the files on the "mock" filesystem should look like when any of the
// `fs` APIs are used.
let mockFiles = Object.create(null)
function __setMockFiles(newMockFiles) {
  mockFiles = Object.create(null)
  for (const dir in newMockFiles) {
    if (!mockFiles[dir]) {
      mockFiles[dir] = newMockFiles[dir]
    }
  }
}

// A custom version of `readdirSync` that reads from the special mocked out
// file list set via __setMockFiles
function readdirSync(directoryPath) {
  return mockFiles[directoryPath] || []
}

fs.__setMockFiles = __setMockFiles
fs.readdirSync = readdirSync

let mockStats = Object.create(null)
function __setMockStats(newMockStats) {
  mockStats = Object.create(null)
  for (const fileOrDir in newMockStats) {
    if (!mockStats[fileOrDir]) {
      mockStats[fileOrDir] = newMockStats[fileOrDir]
    }
  }
}

function statSync(fileOrDir) {
  return mockStats[fileOrDir] || []
}

fs.__setMockStats = __setMockStats
fs.statSync = statSync

export default fs
