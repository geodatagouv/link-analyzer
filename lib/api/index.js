'use strict'

const { Router } = require('express')

const { authenticateSubscriber } = require('./middlewares')
const controller = require('./controller')

const app = new Router()

/* Injectors */
app.param('linkId', controller.link)
app.param('checkNum', controller.check)

/* Actions */
app.get('/links/last-created', controller.lastCreatedLink)
app.get('/links/:linkId', controller.showLink)
app.post('/links/:linkId/checks', controller.doCheck)
app.get('/links/:linkId/checks', controller.checks)
app.get('/links/:linkId/checks/last', controller.lastCheck)
app.get('/links/:linkId/checks/:checkNum', controller.showCheck)
app.post('/links', authenticateSubscriber, controller.upsertLinkAndSubscribe)

module.exports = app
