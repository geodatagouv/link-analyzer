'use strict'
/* eslint unicorn/no-process-exit: "off" */

const { once } = require('lodash')
const { queue } = require('./lib/queue')

// Connect to MongoDB and load models
require('./lib/mongoose')

// Listen for jobs
queue.process('link-analyzer:check', 10, require('./lib/jobs/check'))
queue.process('link-analyzer:notify', 10, require('./lib/jobs/notify'))


/* Handle interruptions */
const gracefulShutdown = once(() => {
  queue.shutdown(5000, err => {
    console.log('Job queue is shut down. ', err || '')
    process.exit()
  })
})

process.on('message', msg => {
  if (msg === 'shutdown') {
    gracefulShutdown()
  }
})

process.on('SIGTERM', gracefulShutdown)

process.on('uncaughtException', err => {
  console.log('Uncaught exception!!')
  console.log(err)
  gracefulShutdown()
})
