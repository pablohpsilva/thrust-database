var createDatasource = function (datasource, context) {
  // return new InitialContext().lookup(datasource)
  return new context().lookup(datasource)
}

exports = function (datasource, context) {
  return (datasource && context)
    ? createDatasource(datasource, context)
    : null
}
