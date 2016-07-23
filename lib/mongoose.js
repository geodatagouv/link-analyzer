const mongoose = require('mongoose');
const Promise = require('bluebird');

mongoose.Promise = Promise;
mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost/link-analyzer');

/* Mount models */
require('./models/link');

module.exports = mongoose;
