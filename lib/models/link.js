const mongoose = require('mongoose');
const { Schema } = require('mongoose');
const { createLinkCheckJob } = require('../queue');
const { sha1 } = require('../util');
const subscriberIds = require('../../integrations').map(integration => integration.subscriberId);

const Mixed = Schema.Types.Mixed;

const schema = new Schema({

  _id: { type: String },
  _created: { type: Date },
  _updated: { type: Date, index: true },

  location: { type: String, required: true, unique: true },

  checkResult: { type: Mixed },

  subscribers: { type: [String], enum: subscriberIds, select: false },

});

/*
** Statics
*/
schema.statics = {

  triggerCheck: function (link) {
    return createLinkCheckJob({
      linkId: link._id,
      linkLocation: link.location,
    });
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
