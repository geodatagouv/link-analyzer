'use strict'

const integrations = require('../integrations.json')
const { strRight } = require('underscore.string')

function unauthorized(res) {
  res.sendStatus(401)
}

function authenticateSubscriber(req, res, next) {
  if (!req.get('Authorization')) return unauthorized(res)
  const token = strRight(req.get('Authorization'), 'Basic ')
  const subscriber = integrations.find(integration => integration.token === token)
  if (!subscriber) return unauthorized(res)
  req.subscriber = subscriber
  next()
}

module.exports = { authenticateSubscriber }
