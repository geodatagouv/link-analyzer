const mongoose = require('mongoose')
const Promise = require('bluebird')
const config = require('./config')

mongoose.Promise = Promise
mongoose.connect(config.get('mongo:url'))

/* Mount models */
require('./models/link')
require('./models/check')

module.exports = mongoose
