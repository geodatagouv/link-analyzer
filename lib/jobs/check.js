const mongoose = require('mongoose');
const Promise = require('bluebird');
const Plunger = require('../plunger');
const { omit } = require('lodash');

const LinkModel = mongoose.model('Link');

function getLink(linkId, linkLocation) {
  if (!linkLocation) throw new Error('linkLocation is required');

  return LinkModel
    .findOne({ _id: linkId, location: linkLocation })
    .select('-checkResult')
    .exec()
    .then(link => {
      if (!link) throw new Error('link not found');
      return link;
    });
}

function archiveIsTooLarge(checkResult) {
  archiveMixedContent(checkResult);
  checkResult.archiveTooLarge = true;
}

function archiveMixedContent(checkResult) {
  Object.assign(checkResult, { available: true, type: 'unknown-archive' });
}

function applyChanges(link, checkResult, instant) {
  return link
    .set('checkResult', checkResult)
    .set('updatedAt', instant)
    .set('touchedAt', instant)
    .save();
}

function propagateChanges() {
  console.log('Should notify subscribers');
  return;
  // const layers = checkResult.archive.datasets.map(dataset => strRightBack(dataset, '/'));
  //
  // return RelatedResource.find({ 'remoteResource.location': linkLocation })
  // .exec()
  // .map(relatedResource => {
  //   return relatedResource
  //   .set('remoteResource.available', checkResult.available)
  //   .set('remoteResource.type', checkResult.type)
  //   .set('remoteResource.layers', layers)
  //   .set('updatedAt', now)
  //   .save()
  //   .then(() => RelatedResource.triggerConsolidation(relatedResource));
  // });
}

function checkLink(jobData, done) {
  const { linkId, linkLocation } = jobData;
  const now = new Date();
  const checker = new Plunger(linkLocation, { abort: 'never' });
  const checkResult = {};

  function inspect() {
    return checker.inspect()
      .then(() => {
        Object.assign(checkResult, checker.toObject());
        checkResult.headers = omit(checkResult.headers, 'set-cookie', 'connection');
        return checkResult;
      });
  }

  function handleArchive() {
    return checker.saveArchive()
      .then(() => checker.decompressArchive())
      .then(() => checker.listFiles())
      .then(files => {
        checkResult.digest = checker.digest.toString('hex');
        checkResult.size = checker.readBytes;

        checkResult.archive = {
          files: files.all,
          datasets: files.datasets,
        };

        if (files.datasets.length === 0) {
          return archiveMixedContent(checkResult);
        }

        checkResult.available = true;
        checkResult.type = 'file-distribution';
      })
      .finally(() => checker.cleanup());
  }

  function exec() {
    return getLink(linkLocation).then(link => {
      return inspect()
      .then(() => {
        if (checker.isArchive()) {
          // Only handle if archive size < 100 MB
          if (checkResult.headers['content-length'] && parseInt(checkResult.headers['content-length'], 10) > (100 * 1024 * 1024)) {
            checker.closeConnection(true);
            return archiveIsTooLarge(checkResult);
          } else {
            return handleArchive();
          }
        } else {
          checker.closeConnection(true);
          if (checkResult.fileExtension === 'ecw') {
            checkResult.type = 'file-distribution';
            checkResult.available = true;
            return;
          }
          if (checkResult.fileExtension === 'csv') {
            checkResult.type = 'file-distribution';
            checkResult.available = true;
            return;
          }

          checkResult.type = 'page';
          checkResult.available = undefined;
        }
      })
      .then(() => applyChanges(link, checkResult, now))
      .then(() => propagateChanges(link))
      .return();
    });
  }

  exec().then(() => done()).catch(done);
}

module.exports = checkLink;
