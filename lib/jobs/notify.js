'use strict'

const { keyBy } = require('lodash')
const got = require('got')
const integrations = require('../../integrations.json')

const subscribers = keyBy(integrations, 'subscriberId')

function notifySubscriber(job, done) {
  const { message, subscriberId } = job.data

  if (!(subscriberId in subscribers)) {
    return done(new Error(`Subscriber ${subscriberId} not registered`))
  }
  const subscriber = subscribers[subscriberId]

  const gotOptions = {
    body: message,
    json: true,
    headers: {
      authorization: `Basic ${subscriber.token}`,
    },
  }

  got.post(subscriber.webhook, gotOptions)
    .then(() => done())
    .catch(done)
}

module.exports = notifySubscriber
