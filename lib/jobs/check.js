const mongoose = require('mongoose');
const Promise = require('bluebird');
const Analyzer = require('../analyzer');
const { omit } = require('lodash');
const { archiveIsTooLarge, setAsUnknownArchive, setAsPage, setAsFileDistribution } = require('../helpers/checkResult');
const debug = require('debug')('link-analyzer:checkLink');

const LinkModel = mongoose.model('Link');
const LinkCheckModel = mongoose.model('LinkCheck');

function getLink(linkId) {
  if (!linkId) throw new Error('linkId is required');

  return LinkModel
    .findOne({ _id: linkId })
    .exec()
    .then(link => {
      if (!link) throw new Error('link not found');
      return link;
    });
}

function getCheck(linkId, num) {
  if (!linkId) throw new Error('linkId is required');
  if (!num) throw new Error('num is required');

  return LinkCheckModel.findOne({ linkId, num }).exec().then(check => {
    if (!check) throw new Error('check not found');
    return check;
  });
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

function checkLink(job, done) {
  const { linkId, linkLocation, num } = job.data;
  const checker = new Analyzer(linkLocation);
  const checkResult = {};

  function log() {
    debug.apply(null, arguments);
    job.log.apply(job, arguments);
  }

  log('starting job #' + job.id);

  function inspect() {
    log('inspecting link…');
    return checker.inspect()
      .then(() => {
        log('analyzing inspection results…');
        Object.assign(checkResult, checker.toObject());
        checkResult.headers = omit(checkResult.headers, 'set-cookie', 'connection');
        return checkResult;
      });
  }

  function handleArchive() {
    log('handling archive…');
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
          return setAsUnknownArchive(checkResult);
        }

        setAsFileDistribution(checkResult);
      })
      .finally(() => checker.cleanup());
  }

  function exec() {
    return Promise.all([
      getLink(linkId),
      getCheck(linkId, num),
    ]).spread((link, check) => {
      return check.start()
      .then(() => inspect())
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
            return setAsFileDistribution(checkResult);
          }
          if (checkResult.fileExtension === 'csv') {
            return setAsFileDistribution(checkResult);
          }

          setAsPage(checkResult);
        }
      })
      .then(() => log('applying changes…'))
      .then(() => {
        link.set({ _updated: new Date() });
        link.set({ lastCheck: { num, finishedAt: new Date() } });
        link.set({ lastSuccessfulCheck: { num, finishedAt: new Date() } });

        return Promise.all([
          check.setAsCompleted(checkResult),
          link.save(),
        ]);
      })
      .then(() => log('propagating changes…'))
      .then(() => propagateChanges(link))
      .then(() => log('completed'))
      .return();
    });
  }

  exec().then(() => done()).catch(done);
}

module.exports = checkLink;
