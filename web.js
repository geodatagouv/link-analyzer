const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');
const { authenticateSubscriber } = require('./lib/middlewares');
const linksController = require('./lib/controllers/links');
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(morgan('dev'));

/* Injectors */
app.param('linkId', linksController.link);

/* Actions */
app.get('/api/links/last-created', linksController.lastCreated);
app.get('/api/links/:linkId', linksController.show);
app.post('/api/links/:linkId/check', linksController.check);
app.post('/api/links', authenticateSubscriber, linksController.upsertAndSubscribe);

app.listen(process.env.PORT || 5000);
