const mongoose = require('mongoose');
const Promise = require('bluebird');
const Plunger = require('../plunger');
// const { strRightBack } = require('underscore.string');
const { omit } = require('lodash');

const LinkModel = mongoose.model('Link');

class RemoteResourceCheck {

  constructor(options = {}) {
    this.options = options;
    this.now = new Date();
  }

  getRemoteResource() {
    return LinkModel
    .findOne({ location: this.options.linkLocation })
    .select('-checkResult')
    .exec()
    .then(remoteResource => {
      if (!remoteResource) throw new Error('RemoteResource not found');
      this.remoteResource = remoteResource;
      return remoteResource;
    });
  }

  checkResource() {
    this.checker = new Plunger(this.options.linkLocation, { abort: 'never' });
    return this.checker.inspect()
    .then(() => {
      const checkResult = this.checker.toObject();
      checkResult.headers = omit(checkResult.headers, 'set-cookie', 'connection');
      this.remoteResource.checkResult = checkResult;
      return checkResult;
    });
  }

  archiveIsTooLarge() {
    this.archiveMixedContent();
    this.remoteResource.set('checkResult.archiveTooLarge', true);
  }

  archiveMixedContent() {
    this.remoteResource
    .set('available', true)
    .set('type', 'unknown-archive');
  }

  handleArchive() {
    return this.checker.saveArchive()
    .then(() => this.checker.decompressArchive())
    .then(() => this.checker.listFiles())
    .then(files => {
      this.remoteResource
      .set('archive.files', files.all)
      .set('archive.datasets', files.datasets)
      .set('checkResult.digest', this.checker.digest.toString('hex'))
      .set('checkResult.size', this.checker.readBytes);

      if (files.datasets.length === 0) {
        return this.archiveMixedContent();
      }

      this.remoteResource
      .set('available', true)
      .set('type', 'file-distribution');
    })
    .finally(() => this.checker.cleanup());
  }

  saveChanges() {
    return this.remoteResource
      .set('updatedAt', this.now)
      .set('touchedAt', this.now)
      .save();
  }

  propagateChanges() {
    console.log('Should notify subscribers');
    return;
    // const layers = this.remoteResource.archive.datasets.map(dataset => strRightBack(dataset, '/'));
    //
    // return RelatedResource.find({ 'remoteResource.location': this.options.linkLocation })
    // .exec()
    // .map(relatedResource => {
    //   return relatedResource
    //   .set('remoteResource.available', this.remoteResource.available)
    //   .set('remoteResource.type', this.remoteResource.type)
    //   .set('remoteResource.layers', layers)
    //   .set('updatedAt', this.now)
    //   .save()
    //   .then(() => RelatedResource.triggerConsolidation(relatedResource));
    // });
  }

  exec() {
    return this.getRemoteResource()
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
          this.remoteResource.set({ type: 'file-distribution', available: true });
          return;
        }
        if (checkResult.fileExtension === 'csv') {
          this.remoteResource.set({ type: 'file-distribution', available: true });
          return;
        }
        this.remoteResource
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
  const checkJob = new RemoteResourceCheck(job.data);
  checkJob.exec()
    .then(() => done())
    .catch(err => done(err));
};
