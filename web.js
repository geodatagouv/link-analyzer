'use strict'

require('./lib/mongoose')
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const morgan = require('morgan')
const { authenticateSubscriber } = require('./lib/middlewares')
const linksController = require('./lib/controllers/links')
const app = express()
const config = require('./lib/config')

app.use(cors())
app.use(bodyParser.json())
app.use(morgan('dev'))

/* Injectors */
app.param('linkId', linksController.link)
app.param('checkNum', linksController.check)

/* Actions */
app.get('/api/links/last-created', linksController.lastCreated)
app.get('/api/links/:linkId', linksController.show)
app.post('/api/links/:linkId/checks', linksController.doCheck)
app.get('/api/links/:linkId/checks', linksController.checks)
app.get('/api/links/:linkId/checks/last', linksController.lastCheck)
app.get('/api/links/:linkId/checks/:checkNum', linksController.showCheck)
app.post('/api/links', authenticateSubscriber, linksController.upsertAndSubscribe)

app.listen(config.get('port'))
