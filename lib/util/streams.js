'use strict'

const { createHash } = require('crypto')
const { through } = require('mississippi')

function computeDigest(algorithm = 'sha384', onDigest) {
  const digester = createHash(algorithm)
  function onChunk(chunk, enc, cb) {
    digester.update(chunk)
    cb(chunk)
  }
  function onFlush() {
    onDigest(digester.digest('base64'))
  }
  return through(onChunk, onFlush)
}

function bytesLimit(limit) {
  if (!limit || !Number.isInteger(limit) || limit < 0) {
    throw new Error('Limit must be a positive integer')
  }

  let readBytes = 0

  return through((chunk, enc, cb) => {
    readBytes += chunk.length
    if (readBytes <= limit) {
      cb(null, chunk)
    } else {
      cb(new Error('Content limit reached'))
    }
  })
}

module.exports = { bytesLimit, computeDigest }
