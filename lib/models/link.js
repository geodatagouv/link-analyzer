const mongoose = require('mongoose');
const { Schema } = require('mongoose');
const { sha1 } = require('../util');
const subscriberIds = require('../../integrations').map(integration => integration.subscriberId);
const redlock = require('../redlock');

const CREATE_LINK_CHECK_TTL = 5000;

const schema = new Schema({
  _id: { type: String },
  _created: { type: Date },
  _updated: { type: Date, index: true },
  location: { type: String, required: true, unique: true },

  lastCheck: {
    num: Number,
    finishedAt: Date,
  },
  lastSuccessfulCheck: {
    num: Number,
    finishedAt: Date,
  },

  subscribers: { type: [String], enum: subscriberIds, select: false },
});

function getLockId(linkId, action) {
  return 'locks:link' + linkId + ':' + action;
}

schema.method('setLock', function (action) {
  if (!action) throw new Error('action is required');
  return redlock.lock(getLockId(this._id, action), CREATE_LINK_CHECK_TTL);
});

schema.method('getLastCheck', function () {
  const LinkCheckModel = mongoose.model('LinkCheck');

  return LinkCheckModel.find({ linkId: this._id }).sort('-num').limit(1).exec().then(results => {
    if (results.length === 0) return undefined;
    return results[0];
  });
});

schema.method('getNextCheckNum', function () {
  return this.getLastCheck().then(lastCheck => {
    if (!lastCheck) return 1;
    if (['created', 'started'].includes(lastCheck.status)) {
      throw new Error('A check has been planned yet or is already started');
    }
    return lastCheck.num + 1;
  });
});

schema.method('createCheck', function () {
  const LinkCheckModel = mongoose.model('LinkCheck');

  return this.setLock('create-check').then(lock => {
    return this.getNextCheckNum().then(num => {
      return LinkCheckModel.create({
        linkId: this._id,
        linkLocation: this.location,
        num,
        status: 'created',
      }).then(() => lock.unlock());
    });
  });
});

/*
** Statics
*/
schema.statics = {

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
        return link.createCheck();
      }
    });
    return exec;
  },

};

mongoose.model('Link', schema);
