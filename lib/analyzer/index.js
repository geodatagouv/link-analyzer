'use strict'

const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const { exec } = require('child_process')

const request = require('request')
const URI = require('urijs')
const Promise = require('bluebird')
const { pick, get, omit } = require('lodash')
const { strRightBack } = require('underscore.string')
const parseContentDisposition = require('content-disposition').parse
const findit = require('findit')
const rimraf = require('rimraf')
const through2 = require('through2')

const execAsync = Promise.promisify(exec)
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

const getExtension = fileName => {
  if (fileName && fileName.includes('.')) {
    return strRightBack(fileName, '.')
  }
  return undefined

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

          const hash = crypto.createHash('sha384')
          let readBytes = 0

          this.response
            .pipe(through2.obj((chunk, enc, cb) => {
              readBytes += chunk.length
              if (readBytes > 100 * 1024 * 1204) {
                this.closeConnection(true)
                reject(new Error('Archive is too large'))
              }
              cb()
            }))
            .once('finish', () => {
              this.readBytes = readBytes
            })

          this.response
            .pipe(hash)
            .once('finish', () => {
              this.digest = 'sha384-' + hash.read().toString('base64')
            })

          this.response
            .pipe(fs.createWriteStream(this.archivePath))
            .once('finish', () => resolve(this.archivePath))
            .on('error', reject)
        })
      })
  }

  decompressArchive() {
    if (this.decompressedDirectoryPath) return Promise.resolve(this.decompressedDirectoryPath)
    if (!this.archivePath) return Promise.reject(new Error('`archivePath` is not defined'))
    let decompressProcess
    if (this.archive === 'zip') {
      decompressProcess = new Promise((resolve, reject) => {
        exec('unzip -d decompressed archive.zip', { cwd: this.tempDirectoryPath }, err => {
          if ((err && err.code === 1) || !err) return resolve()
          reject(err)
        })
      })
    }
    if (this.archive === 'rar') decompressProcess = execAsync('unrar x archive.rar decompressed/', { cwd: this.tempDirectoryPath })
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

module.exports = Analyzer
