'use strict';

const { queue } = require('./lib/queue')
const { once } = require('lodash')

// Connect to MongoDB and load models
require('./lib/mongoose')

// Listen for jobs
queue.process('link-analyzer:check', 10, require('./lib/jobs/check'))
queue.process('link-analyzer:notify', 10, require('./lib/jobs/notify'))


/* Handle interruptions */
const gracefulShutdown = once(() => {
  queue.shutdown(5000, function (err) {
    console.log('Job queue is shut down. ', err || '')
    process.exit()
  })
})

process.on('message', function (msg) {
  if (msg === 'shutdown') {
    gracefulShutdown()
  }
})

process.on('SIGTERM', gracefulShutdown)

process.on('uncaughtException', function (err) {
  console.log('Uncaught exception!!')
  console.log(err)
  gracefulShutdown()
})
