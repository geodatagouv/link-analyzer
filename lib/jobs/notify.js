'use strict'
const { keyBy } = require('lodash')
const request = require('superagent')
const integrations = require('../../integrations.json')
const subscribers = keyBy(integrations, 'subscriberId')

function notifySubscriber(job, done) {
  const { message, subscriberId } = job.data

  if (!(subscriberId in subscribers)) {
    return done(new Error(`Subscriber ${subscriberId} not registered`))
  }
  const subscriber = subscribers[subscriberId]

  request.post(subscriber.webhook)
    .set('Authorization', 'Basic' + subscriber.token)
    .send(message)
    .then(resp => done())
    .catch(done)
}

module.exports = notifySubscriber
