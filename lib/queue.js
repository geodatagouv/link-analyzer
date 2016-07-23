const kue = require('kue-lite');
const Promise = require('bluebird');

const queue = kue.createQueue({
  disableSearch: true,
  prefix: process.env.KUE_PREFIX || 'q',
  redis: {
    port: process.env.REDIS_PORT || 6379,
    host: process.env.REDIS_HOST || 'localhost',
  },
});

function createJob(jobType, jobData, options = {}) {
  return new Promise((resolve, reject) => {
    if (!jobType) return reject(new Error('jobType is a required param'));
    if (!jobData) return reject(new Error('jobData is a required param'));

    const job = queue.create(jobType, jobData);

    if (options.removeOnComplete) job.removeOnComplete(true);
    if (options.attempts) job.attempts(options.attempts);
    if (options.priority) job.priority(options.priority);
    if (options.ttl) job.ttl(options.ttl);

    job.save(err => {
      if (err) return reject(err);
      resolve(job);
    });
  });
}

module.exports = { queue, createJob };
