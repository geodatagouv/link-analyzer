'use strict'

const fs = require('fs')
const { basename, join } = require('path')
const Promise = require('bluebird')
const { computeFileDigest } = require('./digest')

const statAsync = Promise.promisify(fs.stat)
const readdirAsync = Promise.promisify(fs.readdir)

function exploreFile(path) {
  return Promise.props({
    name: basename(path),
    type: 'file',
    digest: computeFileDigest(path),
  })
}

function exploreDirectory(path) {
  return Promise.props({
    name: basename(path),
    type: 'directory',
    children: readdirAsync(path).then(entries => Promise.map(entries, entry => explore(join(path, entry)))),
  })
}

function explore(path) {
  return statAsync(path)
    .then(stats => {
      if (stats.isFile()) {
        return exploreFile(path)
      }
      if (stats.isDirectory()) {
        return exploreDirectory(path)
      }
      throw new Error('Not supported')
    })
}

module.exports = { explore, exploreDirectory, exploreFile }
