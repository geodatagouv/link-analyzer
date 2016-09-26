const mongoose = require('mongoose');
const Promise = require('bluebird');
const Plunger = require('../plunger');
const { omit } = require('lodash');

const LinkModel = mongoose.model('Link');

function getLinkByLocation(linkLocation) {
  if (!linkLocation) throw new Error('linkLocation is required');

  return LinkModel
    .findOne({ location: linkLocation })
    .select('-checkResult')
    .exec()
    .then(link => {
      if (!link) throw new Error('link not found');
      return link;
    });
}

function archiveIsTooLarge(link) {
  archiveMixedContent(link);
  link.set('checkResult.archiveTooLarge', true);
}

function archiveMixedContent(link) {
  link
    .set('available', true)
    .set('type', 'unknown-archive');
}

function saveChanges(link, instant) {
  return link
    .set('updatedAt', instant)
    .set('touchedAt', instant)
    .save();
}

function propagateChanges() {
  console.log('Should notify subscribers');
  return;
  // const layers = link.archive.datasets.map(dataset => strRightBack(dataset, '/'));
  //
  // return RelatedResource.find({ 'remoteResource.location': linkLocation })
  // .exec()
  // .map(relatedResource => {
  //   return relatedResource
  //   .set('remoteResource.available', link.available)
  //   .set('remoteResource.type', link.type)
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

  function inspect(link) {
    return checker.inspect()
      .then(() => {
        const checkResult = checker.toObject();
        checkResult.headers = omit(checkResult.headers, 'set-cookie', 'connection');
        link.checkResult = checkResult;
        return checkResult;
      });
  }

  function handleArchive(link) {
    return checker.saveArchive()
      .then(() => checker.decompressArchive())
      .then(() => checker.listFiles())
      .then(files => {
        link
          .set('archive.files', files.all)
          .set('archive.datasets', files.datasets)
          .set('checkResult.digest', checker.digest.toString('hex'))
          .set('checkResult.size', checker.readBytes);

        if (files.datasets.length === 0) {
          return archiveMixedContent(link);
        }

        link
          .set('available', true)
          .set('type', 'file-distribution');
      })
      .finally(() => checker.cleanup());
  }

  function exec() {
    return getLinkByLocation(linkLocation).then(link => {
      return inspect(link)
      .then(checkResult => {
        if (checker.isArchive()) {
          // Only handle if archive size < 100 MB
          if (checkResult.headers['content-length'] && parseInt(checkResult.headers['content-length'], 10) > (100 * 1024 * 1024)) {
            checker.closeConnection(true);
            return archiveIsTooLarge(link);
          } else {
            return handleArchive(link);
          }
        } else {
          checker.closeConnection(true);
          if (checkResult.fileExtension === 'ecw') {
            link.set({ type: 'file-distribution', available: true });
            return;
          }
          if (checkResult.fileExtension === 'csv') {
            link.set({ type: 'file-distribution', available: true });
            return;
          }
          link
            .set('type', 'page') // Could be easily improved in the future
            .set('available', undefined);
        }
      })
      .then(() => saveChanges(link, now))
      .then(() => propagateChanges(link))
      .return();
    });
  }

  exec().then(() => done()).catch(done);
}

module.exports = checkLink;
