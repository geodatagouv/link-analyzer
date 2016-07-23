const mongoose = require('mongoose');
const { Schema } = require('mongoose');
const { createJob } = require('../queue');
const { sha1 } = require('../util');
const subscriberIds = require('../../integrations').map(integration => integration.subscriberId);

const Mixed = Schema.Types.Mixed;


const REMOTE_RESOURCE_TYPES = [
  'page',
  'file-distribution',
  'unknown-archive',
];


const schema = new Schema({

  location: { type: String, required: true, unique: true },
  hashedLocation: { type: String, required: true, unique: true },

  createdAt: { type: Date },
  touchedAt: { type: Date, index: true },
  updatedAt: { type: Date, index: true },

  type: { type: String, enum: REMOTE_RESOURCE_TYPES, index: true },
  available: { type: Boolean, index: true, sparse: true },

  checkResult: { type: Mixed },

  file: {
    digest: { type: String },
    length: { type: Number },
    downloadedAt: { type: Date },
    dropped: { type: Boolean },
  },

  archive: {
    files: [String],
    datasets: [String],
  },

  subscribers: { type: [String], enum: subscriberIds },

});


/*
** Statics
*/
schema.statics = {

  triggerCheck: function (remoteResource) {
    return createJob(
      'link-analyzer:check',
      {
        remoteResourceId: remoteResource._id,
        remoteResourceLocation: remoteResource.location,
      },
      { removeOnComplete: true }
    );
  },

  upsertAndSubscribe: function (location, subscriber) {
    if (!location) throw new Error('Location is required');
    if (!subscriber) throw new Error('Subscriber is required');
    if (!subscriberIds.includes(subscriber)) throw new Error('Unknown subscriber');

    const LinkModel = this;

    const now = new Date();
    const aLongTimeAgo = new Date(1970, 1, 1);
    const query = { location };
    const changes = {
      $setOnInsert: {
        createdAt: now,
        touchedAt: aLongTimeAgo,
        updatedAt: aLongTimeAgo,
        hashedLocation: sha1(query.location),
      },
      $addToSet: { subscribers: subscriber },
    };

    const exec = LinkModel.findOneAndUpdate(query, changes, { upsert: true, new: true }).exec();
    exec.then(link => {
      if (link.createdAt.getTime() === now.getTime()) {
        LinkModel.triggerCheck(link);
      }
    });
    return exec;
  },

};

const collectionName = 'links';

const model = mongoose.model('Link', schema, collectionName);

module.exports = { model, collectionName, schema };
