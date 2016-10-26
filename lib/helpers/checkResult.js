function archiveIsTooLarge(checkResult) {
  setAsUnknownArchive(checkResult)
  checkResult.archiveTooLarge = true
}

function setAsUnknownArchive(checkResult) {
  checkResult.available = true
  checkResult.type = 'unknown-archive'
}

function setAsFileDistribution(checkResult) {
  checkResult.type = 'file-distribution'
  checkResult.available = true
}

function setAsPage(checkResult) {
  checkResult.type = 'page'
  checkResult.available = false
}

module.exports = { archiveIsTooLarge, setAsUnknownArchive, setAsFileDistribution, setAsPage }
