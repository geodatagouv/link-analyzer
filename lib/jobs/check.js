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

function saveChanges(link) {
  return link
    .set('updatedAt', this.now)
    .set('touchedAt', this.now)
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

class CheckLinkJob {

  constructor(jobData = {}) {
    this.jobData = jobData;
    this.now = new Date();
  }

  checkLink(link) {
    this.checker = new Plunger(link.location, { abort: 'never' });
    return this.checker.inspect()
      .then(() => {
        const checkResult = this.checker.toObject();
        checkResult.headers = omit(checkResult.headers, 'set-cookie', 'connection');
        link.checkResult = checkResult;
        return checkResult;
      });
  }

  handleArchive(link) {
    return this.checker.saveArchive()
    .then(() => this.checker.decompressArchive())
    .then(() => this.checker.listFiles())
    .then(files => {
      link
        .set('archive.files', files.all)
        .set('archive.datasets', files.datasets)
        .set('checkResult.digest', this.checker.digest.toString('hex'))
        .set('checkResult.size', this.checker.readBytes);

      if (files.datasets.length === 0) {
        return archiveMixedContent(link);
      }

      link
        .set('available', true)
        .set('type', 'file-distribution');
    })
    .finally(() => this.checker.cleanup());
  }

  exec() {
    return getLinkByLocation(this.jobData.linkLocation).then(link => {
      return this.checkLink(link)
      .then(checkResult => {
        if (this.checker.isArchive()) {
          // Only handle if archive size < 100 MB
          if (checkResult.headers['content-length'] && parseInt(checkResult.headers['content-length'], 10) > (100 * 1024 * 1024)) {
            this.checker.closeConnection(true);
            return archiveIsTooLarge(link);
          } else {
            return this.handleArchive(link);
          }
        } else {
          this.checker.closeConnection(true);
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
      .then(() => saveChanges(link))
      .then(() => propagateChanges(link))
      .return();
    });
  }

}

module.exports = function (job, done) {
  const checkJob = new CheckLinkJob(job.data);
  checkJob.exec()
    .then(() => done())
    .catch(err => done(err));
};
