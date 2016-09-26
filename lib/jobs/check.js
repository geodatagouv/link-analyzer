const mongoose = require('mongoose');
const Promise = require('bluebird');
const Plunger = require('../plunger');
// const { strRightBack } = require('underscore.string');
const { omit } = require('lodash');

const LinkModel = mongoose.model('Link');

class CheckLinkJob {

  constructor(options = {}) {
    this.options = options;
    this.now = new Date();
  }

  getLink() {
    return LinkModel
    .findOne({ location: this.options.linkLocation })
    .select('-checkResult')
    .exec()
    .then(link => {
      if (!link) throw new Error('link not found');
      this.link = link;
      return link;
    });
  }

  checkResource() {
    this.checker = new Plunger(this.options.linkLocation, { abort: 'never' });
    return this.checker.inspect()
    .then(() => {
      const checkResult = this.checker.toObject();
      checkResult.headers = omit(checkResult.headers, 'set-cookie', 'connection');
      this.link.checkResult = checkResult;
      return checkResult;
    });
  }

  archiveIsTooLarge() {
    this.archiveMixedContent();
    this.link.set('checkResult.archiveTooLarge', true);
  }

  archiveMixedContent() {
    this.link
    .set('available', true)
    .set('type', 'unknown-archive');
  }

  handleArchive() {
    return this.checker.saveArchive()
    .then(() => this.checker.decompressArchive())
    .then(() => this.checker.listFiles())
    .then(files => {
      this.link
      .set('archive.files', files.all)
      .set('archive.datasets', files.datasets)
      .set('checkResult.digest', this.checker.digest.toString('hex'))
      .set('checkResult.size', this.checker.readBytes);

      if (files.datasets.length === 0) {
        return this.archiveMixedContent();
      }

      this.link
      .set('available', true)
      .set('type', 'file-distribution');
    })
    .finally(() => this.checker.cleanup());
  }

  saveChanges() {
    return this.link
      .set('updatedAt', this.now)
      .set('touchedAt', this.now)
      .save();
  }

  propagateChanges() {
    console.log('Should notify subscribers');
    return;
    // const layers = this.link.archive.datasets.map(dataset => strRightBack(dataset, '/'));
    //
    // return RelatedResource.find({ 'remoteResource.location': this.options.linkLocation })
    // .exec()
    // .map(relatedResource => {
    //   return relatedResource
    //   .set('remoteResource.available', this.link.available)
    //   .set('remoteResource.type', this.link.type)
    //   .set('remoteResource.layers', layers)
    //   .set('updatedAt', this.now)
    //   .save()
    //   .then(() => RelatedResource.triggerConsolidation(relatedResource));
    // });
  }

  exec() {
    return this.getLink()
    .then(() => this.checkResource())
    .then(checkResult => {
      if (this.checker.isArchive()) {
        // Only handle if archive size < 100 MB
        if (checkResult.headers['content-length'] && parseInt(checkResult.headers['content-length'], 10) > (100 * 1024 * 1024)) {
          this.checker.closeConnection(true);
          return this.archiveIsTooLarge();
        } else {
          return this.handleArchive();
        }
      } else {
        this.checker.closeConnection(true);
        if (checkResult.fileExtension === 'ecw') {
          this.link.set({ type: 'file-distribution', available: true });
          return;
        }
        if (checkResult.fileExtension === 'csv') {
          this.link.set({ type: 'file-distribution', available: true });
          return;
        }
        this.link
        .set('type', 'page') // Could be easily improved in the future
        .set('available', undefined);
      }
    })
    .then(() => this.saveChanges())
    .then(() => this.propagateChanges())
    .return();
  }

}

module.exports = function (job, done) {
  const checkJob = new CheckLinkJob(job.data);
  checkJob.exec()
    .then(() => done())
    .catch(err => done(err));
};
