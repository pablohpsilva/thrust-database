/** @ignore */
var Statement = Java.type('java.sql.Statement')
/** @ignore */
var Timestamp = Java.type('java.sql.Timestamp')
/** @ignore */
var hasSQLInjection = require('./_hasSqlnjection')

/**
 * Close transaction
 */
var closeStatement = function (statement) {
  statement.close()
}

var setStatementObject = function (statement, key, value) {
  if (value == null) {
    statement.setObject(key, value);
  } else if (value.constructor.name == "Date") {
    statement.setTimestamp(key, new Timestamp(value.getTime()));
  } else if (value.constructor.name === "Blob") {
    statement.setBinaryStream(key, value.fis, value.size);
  } else {
    statement.setObject(key, value);
  }
}

var buildStatementObject = function (args) {
  var statement = {}
  args.map(function (value, key) {
    setStatementObject(statement, key, value)
  })

  return statement
}

var execute = function (values) {

  if (hasSqlInject(values) != null) {
    return {
      error: true,
      message: 'Attempt sql injection!'
    };
  }

  var args = values || [],
    rows = [],
    statement = buildStatementObject(args)

  if (this.sql.toUpperCase().indexOf("SELECT") == 0) {
    var rs = this.stmt.executeQuery();
    var rsmd = rs.getMetaData();
    var numColumns = rsmd.getColumnCount();
    var columns = [];
    var types = [];
    rows = [];

    for (var cl = 1; cl < numColumns + 1; cl++) {
      columns[cl] = rsmd.getColumnLabel(cl);
      types[cl] = rsmd.getColumnType(cl);
    }

    while (rs.next()) {
      var row = {};

      for (var i = 1; i < numColumns + 1; i++) {
        // TODO remove java... thing below
        var value = (types[i] === java.sql.Types.BINARY)
          ? rs.getBytes(i)
          : rs.getObject(i)

        // row[columns[i]] = (rs.wasNull()) ? null : value;
        if (rs.wasNull()) {
          row[columns[i]] = null;
        } else if ([91, 92, 93].indexOf(types[i]) >= 0) {
          row[columns[i]] = value.toString();
        } else if (types[i] == java.sql.Types.OTHER) { // json in PostgreSQL
          try {
            row[columns[i]] = JSON.parse(value);
          } catch (error) {
            row[columns[i]] = value;
          }
        } else {
          row[columns[i]] = value;
        }
      }

      rows.push(row);
    }

    return rows;
  }

  if (this.sql.toUpperCase().indexOf("INSERT") == 0) {
    statement.executeUpdate();

    var rsk = statement.getGeneratedKeys()

    while (rsk.next()) {
      rows.push(rsk.getObject(1))
    }

    return {
      error: false,
      keys: rows
    };
  }

  return {
    error: false,
    affectedRows: statement.executeUpdate()
  }
}

/**
 * @class PrepareStatment
 * @desc Statement que será utilizado para acessar o BD.
 * @ignore
 */
var PrepareStatment = {
    /*stmt: conn.prepareStatement(sql, generateKeys),*/
    stmt: null,

	/**
	 * @desc Executa um Prepare Statement
	 * @param {Array} [args] Array de objetos que contem os parametros para executar o statement.
	 * @returns {Object} No caso do comando ser um SELECT retorna um array de objetos
	 * ou caso contr&aacute;rio um objeto com a propriedade <i>error<i> valorada com um booleano
	 * <i>true<i> ou <i>false<i> de acordo com o resultado da execu&ccedil;&atilde;o do comando SQL.
	 */
    execute: function (args) {
        args = args || [];

        var hasSqlInject = this.sql.match(/[\t\r\n]|(--[^\r\n]*)|(\/\*[\w\W]*?(?=\*)\*\/)/gi);

        if (hasSqlInject != null) {
            result = {
                error: true,
                message: 'Attempt sql injection!'
            };
        }

        for (var i = 0; i < args.length; i++) {
            if (args[i] == null) {
                this.stmt.setObject(i + 1, args[i]);
            } else if (args[i].constructor.name == "Date") {
                this.stmt.setTimestamp(i + 1, new Timestamp(args[i].getTime()));
            } else if (args[i].constructor.name === "Blob") {
                this.stmt.setBinaryStream(i + 1, args[i].fis, args[i].size);
            } else {
                this.stmt.setObject(i + 1, args[i]);
            };
        }
        var rows = [];

        if (this.sql.toUpperCase().indexOf("SELECT") == 0) {
            var rs = this.stmt.executeQuery();
            var rsmd = rs.getMetaData();
            var numColumns = rsmd.getColumnCount();
            var columns = [];
            var types = [];
            rows = [];

            for (var cl = 1; cl < numColumns + 1; cl++) {
                columns[cl] = rsmd.getColumnLabel(cl);
                types[cl] = rsmd.getColumnType(cl);
            }

            while (rs.next()) {
                var row = {};

                for (var i = 1; i < numColumns + 1; i++) {
                    var value;

                    if (types[i] === java.sql.Types.BINARY) {
                        value = rs.getBytes(i)
                    } else {
                        value = rs.getObject(i);
                    }

                    // row[columns[i]] = (rs.wasNull()) ? null : value;
                    if (rs.wasNull()) {
                        row[columns[i]] = null;
                    } else if ([91, 92, 93].indexOf(types[i]) >= 0) {
                        row[columns[i]] = value.toString();
                    } else if (types[i] == java.sql.Types.OTHER) { // json in PostgreSQL
                        try {
                            row[columns[i]] = JSON.parse(value);
                        } catch (error) {
                            row[columns[i]] = value;
                        }
                    } else {
                        row[columns[i]] = value;
                    }

					/*
					if ([-5,-2,3,8,6,4,2,7].indexOf(types[i]) >= 0) {
					    row[columns[i]] = (rs.wasNull()) ? null : new Number(value);
					    print("Number: " + row[columns[i]]);
					} else if ([1,-16,-4,-1,-15,-3,12].indexOf(types[i]) >= 0) {
					    row[columns[i]] = (rs.wasNull()) ? null : value.toString();
					    print("String: " + row[columns[i]]);
					} else {
					    row[columns[i]] = (rs.wasNull()) ? null : value;
					}
					*/
                } //end for

                rows.push(row);
            }
            return rows;

        } else if (this.sql.toUpperCase().indexOf("INSERT") == 0) {
            this.stmt.executeUpdate();

            var rsk = this.stmt.getGeneratedKeys();

            while (rsk.next()) {
                // var key = rsk.getObject(1);
                // rows = {
                // 	"id": parseInt(key.toString())
                // };
                rows.push(rsk.getObject(1));
            }
            return {
                error: false,
                keys: rows
            };
        } else {
            var result = this.stmt.executeUpdate();
            return {
                error: false,
                affectedRows: result
            };
        }
    },

	/**
	 * @desc Executa um prepare Statement passando como paramâtro varias linhas.
	 * @param    {Array} [args] Array de Arrays que contem objetos os parametros para executar o statement.
	 * @returns {Object} No caso do comando ser um SELECT retorna um array que contem arrays de o objetos
	 * obtidos na execucao da consulta no banco, ou caso contr&aacute;rio um array de objeto
	 * com a propriedade <i>error<i> valorada com um booleano
	 * <i>true<i> ou <i>false<i> de acordo com o resultado da execu&ccedil;&atilde;o do comando SQL.
	 */
    executeRows: function (args) {
        args = args || [];

        var hasSqlInject = this.sql.match(/[\t\r\n]|(--[^\r\n]*)|(\/\*[\w\W]*?(?=\*)\*\/)/gi);

        if (hasSqlInject != null) {
            result = {
                error: true,
                message: 'Attempt sql injection!'
            };
        }

        if (this.sql.trim().toUpperCase().indexOf("SELECT") == 0) {
            var rows = new Array();
            args.forEach(function (row, idx) {
                rows.push(this.execute(row));
            });
            return rows;
        } else {
            for (var i = 0; i < args.length; i++) {
                for (var j = 0; j < args[i].length; j++) {
                    if (args[i][j] == null) {
                        this.stmt.setObject(j + 1, args[i][j]);
                    } else if (args[i][j].constructor.name == "Date") {
                        this.stmt.setTimestamp(j + 1, new java.sql.Timestamp(args[i][j].getTime()));
                    } else if (args[i].constructor.name === "Blob") {
                        this.stmt.setBinaryStream(i + 1, args[i].fis, args[i].size);
                    } else {
                        this.stmt.setObject(j + 1, args[i][j]);
                    };
                }
                this.stmt.addBatch();
                if ((i + 1) % 100 == 0) {
                    this.stmt.executeBatch();
                };
            }
            var rsk = this.stmt.executeBatch();
            var rows = [];
            for (var key in rsk) {
                if (rsk[key] >= 0) {
                    rows.push({
                        error: false,
                        affectedRows: rsk[key]
                    });
                } else if (rsk[key] == java.sql.Statement.SUCCESS_NO_INFO) {
                    rows.push({
                        error: false,
                        affectedRows: "unknown"
                    });
                } else if (rsk[key] == java.sql.Statement.EXECUTE_FAILED) {
                    rows.push({
                        error: true,
                        affectedRows: 0
                    });
                };
            };
            return rows;
        };
    }
};
