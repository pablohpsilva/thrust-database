/**
 * @param {String} string
 * @return {Boolean}
 * Checks string for SQL injection attempt.
 */
exports = function (string) {
  return string.match(/[\t\r\n]|(--[^\r\n]*)|(\/\*[\w\W]*?(?=\*)\*\/)/gi)
}
