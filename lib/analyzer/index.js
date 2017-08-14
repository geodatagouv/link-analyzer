'use strict'

const fs = require('fs')
const os = require('os')
const { extname } = require('path')
const { createHash } = require('crypto')

const { execa } = require('execa')
const request = require('request')
const URI = require('urijs')
const Promise = require('bluebird')
const { pick, get, omit } = require('lodash')
const parseContentDisposition = require('content-disposition').parse
const findit = require('findit')
const rimraf = require('rimraf')
const { pipe, through } = require('mississippi')

const rimrafAsync = Promise.promisify(rimraf)

function mkTempDir() {
  return new Promise((resolve, reject) => {
    fs.mkdtemp(os.tmpdir() + '/plunger_', (err, path) => {
      if (err) return reject(err)
      resolve(path)
    })
  })
}

const FIELDS = [
  'statusCode',
  'headers',
  'contentDisposition',
  'fileName',
  'fileExtension',
  'binary',
  'archive',
]

function getExtension(filename) {
  if (!filename) throw new Error('filename is required')
  return extname(filename).substr(1).toLowerCase()
}

const BINARY_CONTENT_TYPES = [
  'application/octet-stream',
  'application/binary',
]

const ARCHIVE_EXTENSIONS = [
  'zip',
  'tar',
  'rar',
  'gz',
  'bz2',
  '7z',
  'xz',
]

class Analyzer {

  constructor(location) {
    this.rawLocation = location
    this.location = new URI(location)
  }

  executeRequest() {
    return new Promise((resolve, reject) => {
      this.req = request
        .get(this.rawLocation)
        .on('error', reject)
        .on('response', response => {
          this.response = response
          this.response.pause()
          resolve(this)
        })
    })
  }

  extractDataFromResponse() {
    const headers = omit(this.response.headers, 'set-cookie', 'connection')
    this.statusCode = this.response.statusCode
    this.headers = headers
    if (headers['content-disposition']) {
      this.contentDisposition = parseContentDisposition(headers['content-disposition'])
    }
    return this
  }

  closeConnection(force = false) {
    if (force) this.response.destroy()
    return this
  }

  inspect() {
    return this.executeRequest()
      .then(() => this.extractDataFromResponse())
      .then(() => this.closeConnection())
  }

  get fileName() {
    return get(this, 'contentDisposition.parameters.filename') || this.location.filename(true)
  }

  get fileExtension() {
    const attachmentExt = getExtension(get(this, 'contentDisposition.parameters.filename'))
    const urlExt = getExtension(this.location.filename(true))
    return attachmentExt || urlExt
  }

  get binary() {
    const contentType = this.headers['content-type']
    return contentType && BINARY_CONTENT_TYPES.includes(contentType)
  }

  get archive() {
    if (ARCHIVE_EXTENSIONS.includes(this.fileExtension)) {
      return this.fileExtension
    }
    return false
  }

  toObject() {
    return pick(this, ...FIELDS)
  }

  isArchive() {
    return (this.archive === 'zip' && this.fileExtension === 'zip') || (this.archive === 'rar' && this.fileExtension === 'rar')
  }

  createTempDirectory() {
    return mkTempDir()
      .then(path => {
        this.tempDirectoryPath = path
        return this.tempDirectoryPath
      })
  }

  saveArchive() {
    return this.createTempDirectory()
      .then(path => {
        return new Promise((resolve, reject) => {
          this.archivePath = path + '/archive.' + this.archive

          const onDigest = digest => {
            this.digest = 'sha384-' + digest
          }

          pipe(
            this.response,
            computeDigest('sha384', onDigest),
            bytesLimit(100 * 1024 * 1024),
            fs.createWriteStream(this.archivePath),
            err => {
              if (err) return reject(err)
              resolve(this.archivePath)
            }
          )
        })
      })
  }

  decompressArchive() {
    if (this.decompressedDirectoryPath) return Promise.resolve(this.decompressedDirectoryPath)
    if (!this.archivePath) return Promise.reject(new Error('`archivePath` is not defined'))
    let decompressProcess
    if (this.archive === 'zip') {
      decompressProcess = execa('unzip', ['-d', 'decompressed', 'archive.zip'], { cwd: this.tempDirectoryPath })
    }
    if (this.archive === 'rar') {
      decompressProcess = execa('unrar', ['x', 'archive.rar', 'decompressed/'], { cwd: this.tempDirectoryPath })
    }
    if (decompressProcess) {
      return decompressProcess.then(() => {
        this.decompressedDirectoryPath = this.tempDirectoryPath + '/decompressed'
        return this.decompressedDirectoryPath
      })
    }
    return Promise.reject(new Error('Archive type not supported: ' + this.archive))

  }

  listFiles() {
    if (!this.decompressedDirectoryPath) return Promise.reject(new Error('No iterable path found'))
    const startPoint = this.decompressedDirectoryPath.length + 1
    const paths = []
    const datasets = []
    return new Promise((resolve, reject) => {
      findit(this.decompressedDirectoryPath)
        .on('file', file => {
          const shortFileName = file.substring(startPoint)
          paths.push(shortFileName)
          if (shortFileName.match(/\.(shp|tab|mif)$/i)) datasets.push(shortFileName)
        })
        .on('end', () => resolve({ all: paths, datasets }))
        .on('error', reject)
    })
  }

  cleanup() {
    if (this.tempDirectoryPath) {
      return rimrafAsync(this.tempDirectoryPath)
        .then(() => {
          this.tempDirectoryPath = undefined
        })
    }
  }

}

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

module.exports = Analyzer
