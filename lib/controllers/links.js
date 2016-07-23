const mongoose = require('mongoose');
const LinkModel = mongoose.model('Link');

/*
** Middlewares
*/
exports.link = function (req, res, next, id) {
  LinkModel
  .findOne({ hashedLocation: id })
  .lean()
  .exec(function(err, link) {
    if (err) return next(err);
    if (!link) return res.status(404).end();
    req.link = link;
    next();
  });
};

/*
** Actions
*/
exports.show = function (req, res) {
  res.send(req.link);
};

exports.lastCreated = function (req, res, next) {
  LinkModel
    .find({})
    .select('-_id location hashedLocation createdAt')
    .sort('-createdAt')
    .lean()
    .limit(20)
    .exec((err, links) => {
      if (err) return next(err);
      res.send(links);
    });
};

exports.check = function (req, res, next) {
  LinkModel.triggerCheck(req.link, function (err) {
    if (err) return next(err);
    res.sendStatus(200);
  });
};

exports.upsertAndSubscribe = function (req, res, next) {
  if (!req.body || !req.body.url) return res.sendStatus(400);
  LinkModel.upsertAndSubscribe(req.body.url, req.subscriber.subscriberId)
    .then(link => res.send(link))
    .catch(err => next(err));
};
