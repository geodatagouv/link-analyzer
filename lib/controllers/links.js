'use strict'

const mongoose = require('mongoose')

const LinkModel = mongoose.model('Link')
const LinkCheckModel = mongoose.model('LinkCheck')

/*
** Middlewares
*/
exports.link = function (req, res, next, id) {
  LinkModel
    .findById(id)
    .exec((err, link) => {
      if (err) return next(err)
      if (!link) return res.status(404).end()
      req.link = link
      next()
    })
}

exports.check = function (req, res, next, id) {
  LinkCheckModel
    .findOne({ linkId: req.params.linkId, num: id })
    .exec((err, check) => {
      if (err) return next(err)
      if (!check) return res.status(404).end()
      req.check = check
      next()
    })
}

/*
** Actions
*/
exports.show = function (req, res) {
  res.send(req.link)
}

exports.showCheck = function (req, res) {
  res.send(req.check)
}

exports.lastCheck = function (req, res, next) {
  LinkCheckModel
    .findOne({ linkId: req.link._id, status: { $ne: 'created' } })
    .select('-__v -_id')
    .sort('-num')
    .exec((err, lastCheck) => {
      if (err) return next(err)
      if (!lastCheck) return res.sendStatus(404)
      res.send(lastCheck)
    })
}

exports.lastCreated = function (req, res, next) {
  LinkModel
    .find({})
    .select('-__v')
    .sort('-_created')
    .lean()
    .limit(20)
    .exec((err, links) => {
      if (err) return next(err)
      res.send(links)
    })
}

exports.doCheck = function (req, res, next) {
  req.link.createCheck()
    .then(() => res.sendStatus(200))
    .catch(next)
}

exports.checks = function (req, res, next) {
  LinkCheckModel
    .find({ linkId: req.link._id })
    .select('-__v -result -_id -linkLocation -linkId')
    .sort('-num')
    .exec((err, checks) => {
      if (err) return next(err)
      res.send(checks)
    })
}

exports.upsertAndSubscribe = function (req, res, next) {
  if (!req.body || !req.body.location) return res.sendStatus(400)
  LinkModel.upsertAndSubscribe(req.body.location, req.subscriber.subscriberId)
    .then(link => res.send(link))
    .catch(err => next(err))
}
