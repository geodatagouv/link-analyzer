'use strict'

const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const morgan = require('morgan')

require('./lib/mongoose')

const api = require('./lib/api')
const config = require('./lib/config')

const app = express()

app.use(cors())
app.use(bodyParser.json())
app.use(morgan('dev'))

app.use('/api', api)

app.listen(config.get('port'))
