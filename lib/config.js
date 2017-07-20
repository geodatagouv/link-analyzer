'use strict';

const nconf = require('nconf')

const defaults = {

  port: 5000,

  mongo: {
    url: 'mongodb://localhost/link-analyzer',
  },

  redis: {
    host: 'localhost',
    port: 6379,
  },

  kue: {
    prefix: 'q',
  },

}

nconf
  .file({ file: __dirname + '/../config.json' })
  .env({ separator: '_', lowerCase: true })
  .defaults({ store: defaults })

module.exports = nconf
