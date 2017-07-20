'use strict';

const kue = require('kue-lite')
const Promise = require('bluebird')
const config = require('./config')

const queue = kue.createQueue({
  disableSearch: true,
  prefix: config.get('kue:prefix'),
  redis: {
    port: config.get('redis:port'),
    host: config.get('redis:host'),
  },
})

function createJob(jobType, jobData, options = {}) {
  return new Promise((resolve, reject) => {
    if (!jobType) return reject(new Error('jobType is a required param'))
    if (!jobData) return reject(new Error('jobData is a required param'))

    const job = queue.create(jobType, jobData)

    if (options.removeOnComplete) job.removeOnComplete(true)
    if (options.attempts) job.attempts(options.attempts)
    if (options.priority) job.priority(options.priority)
    if (options.ttl) job.ttl(options.ttl)

    job.save(err => {
      if (err) return reject(err)
      resolve(job)
    })
  })
}

function createLinkCheckJob(jobData) {
  return createJob('link-analyzer:check', jobData, { removeOnComplete: false })
}

module.exports = { queue, createJob, createLinkCheckJob }
