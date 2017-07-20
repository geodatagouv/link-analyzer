'use strict';

const mongoose = require('mongoose')
const { Schema } = require('mongoose')
const Mixed = Schema.Types.Mixed
const { createLinkCheckJob } = require('../queue')

const STATUSES = [
  'created',
  'started',
  'completed',
  'errored',
]

const schema = new Schema({
  linkId: { type: String, required: true, index: true },
  linkLocation: { type: String },

  num: { type: Number, required: true },

  status: { type: String, enum: STATUSES, required: true },

  startedAt: { type: Date },
  finishedAt: { type: Date },
  duration: { type: Number },

  result: { type: Mixed },
})

schema.index({ linkId: 1, num: 1 }, { unique: true })

schema.method('start', function () {
  return this.set({
    status: 'started',
    startedAt: new Date(),
  }).save()
})

function finish(check) {
  const endDate = new Date()
  return check.set({
    finishedAt: endDate,
    duration: endDate.getTime() - check.startedAt.getTime(),
  })
}

schema.method('setAsCompleted', function (result) {
  return finish(this).set({
    status: 'completed',
    result,
  }).save()
})

schema.method('setAsErrored', function () {
  return finish(this).set({
    status: 'errored',
  }).save()
})

schema.pre('save', function (next) {
  if (this.status === 'created') {
    createLinkCheckJob({
      linkId: this.linkId,
      linkLocation: this.linkLocation,
      num: this.num,
    }).then(() => next()).catch(next)
  } else {
    next()
  }
})

mongoose.model('LinkCheck', schema, 'checks')
