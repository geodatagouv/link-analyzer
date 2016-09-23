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

  _id: { type: String },
  _created: { type: Date },
  _updated: { type: Date, index: true },

  location: { type: String, required: true, unique: true },

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

    const id = sha1(location);
    const now = new Date();

    const changes = {
      $setOnInsert: {
        _id: id,
        _created: now,
        _updated: now,
        location,
      },
      $addToSet: { subscribers: subscriber },
    };

    const exec = LinkModel.findOneAndUpdate({ location }, changes, { upsert: true, new: true }).exec();
    exec.then(link => {
      if (link._created.getTime() === now.getTime()) {
        return LinkModel.triggerCheck(link);
      }
    });
    return exec;
  },

};

const collectionName = 'links';

const model = mongoose.model('Link', schema, collectionName);

module.exports = { model, collectionName, schema };
