/** @ignore */
var Statement = Java.type('java.sql.Statement')
/** @ignore */
var hasSQLInjection = require('./_hasSqlnjection')
/** @ignore */
var InitialContext = Java.type('javax.naming.InitialContext');
/** @ignore */
var datasource = (require('./datasource'))(config.database.datasource, InitialContext)

/**
 * Retorna um objeto Connection que representa a conexão com o banco de dados. Esta API é exclusiva para uso
 * interno do BoxJS.
 * @param {Object} datasource
 * @param {Boolean} autoCommit
 * @returns {Connection}
 */
var _getConnection = function (datasource) {
  return function (autoCommit) {
    return (datasource)
      ? datasource.getConnection().setAutoCommit(autoCommit || false)
      : null
  }
}

var _closeClosable = function (closable) {
  if (Object.hasOwnProperty.call(closable, 'close')) {
    closable.close()
  }
}

var _prepareInsertSQL = function (table, itens) {
  var sqlInsert = 'INSERT INTO ' + table + ' (',
    values = ' VALUES (',
    vrg = ""

  Object.keys(itens[0]).map(function (key) {
    sqlInsert += vrg + key
    values += vrg + "?"
    vrg = ","
  })

  sqlInsert += ') ' + values + ')'

  return sqlInsert
}

var _prepareUpdateSQL = function (table, row, where) {
  var sql = 'UPDATE ' + table + ' SET ',
    vrg = '',
    and = ' '

  Object.keys(row)
    .map(function (key) {
      sql += vrg + key + ' = ? '
      vrg = ','
    })

  if (where) {
    sql += ' WHERE '

    Object.keys(where)
      .map(function (key) {
        sql += and + key + " = ? "
        and = " AND "
      })
  }

  return sql
}

var _prepareDeleteSQL = function (table, row) {
  var sql = 'DELETE FROM ' + table + ' WHERE 1=1 '

  Object.keys(row)
    .map(function (key) {
      sql += ' AND ' + key + '= ?'
    })

  return sql
}

var _execute = function (sql) {
  return function (args) {
    return function (connection) {
      var stmt = createPrepareStatement(sql, connection)
      var result = (!hasSQLInjection(sql))
        ? stmt.execute(args)
        : { error: true, message: 'Attempt sql injection!' }

      closeStatement(stmt)
      closeConnection(connection)

      return result
    }
  }
}

var _executeInSingleTransaction = function (fncScript, context, connection) {
  var rs = { error: false };
  var connection = db.getConnection();

  function execute(sql, args) {
    return db.execute(sql, args, connection);
  };

  var insert = function (table, rows) {
    return db.insert(table, rows, connection);
  };

  var update = function (table, row, where) {
    return db.update(table, row, where, connection);
  }

  var deleteFnc = function (table, row) {
    return db["delete"](table, row, connection);
  }

  var deleteByExample = function (table, row) {
    return db.deleteByExample(table, row, connection);
  }

  // commitOnReturn = typeof commitOnReturn !== 'undefined' ? commitOnReturn : true;

  try {
    connection.setAutoCommit(false)
    rs.result = fncScript({ execute: execute, insert: insert, "delete": deleteFnc, update: update, deleteByExample: deleteByExample }, context);
    connection.commit();
  } catch (ex) {
    print(ex);
    connection.rollback();
    rs = { error: true, execption: ex };
  } finally {
    connection.close();
    ds.conn = connection = null;
  }

  return rs;
}

var _objectToArray = function (obj) {
  // TODO: Copy object from arg
  var cloneObj = Object(obj)
  return Object.keys(row)
    .map(function (key) {
      return cloneObj[key]
    });
}

var _insert = function (connection) {
  return function (table) {
    return function (items) {
      return function (shouldCloseConnection) {
        var willCloseConnection = shouldCloseConnection && true,
          itensArray = itens instanceof Object
            ? [itens || {}]
            : itens,
          sqlInsert = _prepareInsertSQL(table, itensArray),
          stmt = createPrepareStatement(sqlInsert, connection),
          result = (vals.length > 1)
            ? stmt.executeRows(vals)
            : stmt.execute(vals[0])

        closeStatement(stmt)

        if (willCloseConnection) {
          closeConnection(connection)
        }

        return result
      }
    }
  }
}

var _update = function (connection) {
  return function (table) {
    return function (row) {
      return function (where) {
        return function (shouldCloseConnection) {
          var sql = _prepareUpdateSQL(table, row, where),
            willCloseConnection = shouldCloseConnection && true,
            vals = _objectToArray(row).concat(objectToArray(where)),
            stmt = createPrepareStatement(sql, connection),
            result = stmt.execute(vals)

          closeStatement(stmt)
          if (willCloseConnection) {
            closeConnection(connection)
          }

          return result
        }
      }
    }
  }
}

var _deleteByExample = function (connection) {
  return function (table) {
    return function (row) {
      return function (shouldCloseConnection) {
        var willCloseConnection = shouldCloseConnection && true,
          sql = _prepareDeleteSQL(table, row),
          vals = objectToArray(row),
          // TODO: remove java.sql.Statement.NO_GENERATED_KEYS
          stmt = createPrepareStatement(sql, connection, java.sql.Statement.NO_GENERATED_KEYS),
          result = stmt.execute(vals)

        closeStatement(stmt)
        if (willCloseConnection) {
          closeConnection(conn)
        }

        return result
      }
    }
  }
}

var createPrepareStatement = function (sql, connection, keys) {
  var DBPrepareStatement = function () {
    var conn = connection || getConnection(true),
      generatedKeys = keys || Statement.RETURN_GENERATED_KEYS

    this.sql = sql.trim()
    this.stmt = conn.prepareStatement(sql.trim(), generatedKeys)
  }

  DBPrepareStatement.prototype = PrepareStatment

  return new DBPrepareStatement()
}

var getConnection = _getConnection(datasource)

var closeStatement = _closeClosable

var closeConnection = _closeClosable

/**
 * @desc Executa um <i>statement</i> SQL (DML).
 * @param  {String} sql - O comando SQL a ser executado.
 * @param {array} args - Lista de argumentos
 * @param  {Connection} connection - Conex&atilde;o com o banco de dados.
 * @returns {Object} No caso do comando ser um SELECT retorna um array de objetos
 * ou caso contr&aacute;rio um objeto com a propriedade <i>error<i> valorada com um booleano
 * <i>true<i> ou <i>false<i> de acordo com o resultado da execu&ccedil;&atilde;o do comando SQL.
 */
var execute = function(sql, args, connection) {
  return _execute(sql)(args)(connection || getConnection(true))
}

/**
 * Executa uma função dentro de uma única transação.
 * @param {Function} fncScript - função com vários acessos a banco de dados que recebe como parâmetros
 * um objecto com um único método *execute* equivalente ao `db.execute` e um objeto *context*.
 * @param {Object} context - um objeto que será passado como segundo parâmetro da função *fncScript*.
 * @returns {Object}
 */
var executeInSingleTransaction = function (fncScript, context) {
  return _executeInSingleTransaction(fncScript, context)
}

/**
 * Insere um ou mais objetos na tabela.
 * @param {String} table - Nome da tabela
 * @param {Array|Object} itens - Array com objetos a serem inseridos na tabela,
 * ou objeto único a ser inserido.
 * @param {Transaction} transaction - Transação em que será executado os comandos.
 * @return {Array|Object} Para inserção de varios itens retorna um Array de Objetos que
 * indicam para cada item o resultado da execução do comando na base e a quantidade de linhas afetadas.
 * Para inserção de um único item retorna o id do item inserido.
 */
var insert = function (table, itens, connection, shouldCloseConnection) {
  return _insert(connection || getConnection(true))(table)(itens)(shouldCloseConnection || true)
}

/**
 * Atualiza dados da tabela no banco.
 * @param {String} table - Nome da tabela
 * @param {Object} row- Dados das colunas a serem atualizadas no banco de dados.
 * @param {Object} where- Condição das colunas a serem atualizadas no banco de dados.
 * @param {Transaction} transaction - Transação na qual seráo realizados os comandos no banco de dados.
 * @example <caption>Para atualizar na tabela empresa o campo nroFuncionarios para 250, aonde
 * o nome da empresa é Softbox utilizamos o seguinte comando: </caption>
 *  tempresa.update({nroFuncionarios: 250},{empresa: "Softbox"});
 * @returns {Object} Objeto que informa o status da execução do comando e a quantidade de
 * linhas afetadas.
 */
var update = function (table, row, where, connection, shouldCloseConnection) {
  return _update(connection || getConnection(true))(rable)(row)(where)(shouldCloseConnection || true)
}

/**
 * Remove itens do banco de dados de acordo com o objeto passado
 * @param {String} table - Nome da tabela
 * @param {Object} row - Objeto que será usado como exemplo para realizar a consulta.
 * @param {Transaction} transaction - Transação na qual seráo realizados os comandos no banco de dados.
 * @example <caption> Para remover de banco de dados todas as empresas do estado de Minas Gerais
 *  utilizamos o seguinte comando: </caption>
 *  tempresa.deleteByExample({estado: "MG"});
 * @returns {Object} Informa o status da execução do comando e a quantidade de
 * linhas afetadas.
 */
var deleteByExample = function (table, row, connection, shouldCloseConnection) {
  return _deleteByExample(connection || getConnection(true))(table)(row)(shouldCloseConnection)
}



var db = {

  getConnection: getConnection,

  /**
	 * @desc Cria um novo <i> Prepare Statement </i>. Esta API é exclusiva para uso interno do BoxJS.
	 * @param {String} sql - O comando SQL a ser executado.
	 * @param {Connection} connection - Conexão na qual serão executados os comandos.
	 * @returns {PrepareStatment} - Objetos com métodos execute e executeRows.
	 */
  createPrepareStatement: function (sql, connection) {

    var DBPrepareStatement = function () {
      /*this.mustCloseTransation = transaction == undefined ? true : false;*/
			/*this.transaction = transaction  || db.getTransaction(true);
			var conn = this.transaction.getConnection();*/

      var conn = connection || db.getConnection(true);
      var generateKeys = Statement.RETURN_GENERATED_KEYS;

      this.sql = sql.trim();
      this.stmt = conn.prepareStatement(sql, generateKeys);
    };

    DBPrepareStatement.prototype = PrepareStatment;

    return new DBPrepareStatement();
  },

  executeInSingleTransaction: executeInSingleTransaction,

  execute: execute,

  insert: insert,

  update: update,

  deleteByExample: deleteByExample,

	/**
	 * Remove determinado elemento do banco de dados, buscando o objeto por sua chave primaria.
	 * @param {Object} row - Informação do objeto a ser removido
	 * @param {Transaction} transaction - Transação na qual seráo realizados os comandos no banco de dados.
	 * @returns Informa o status da execução do comando e a quantidade de linhas afetadas.
	 */
	"delete": function (table, row, connection) {
		var vals = {};
		this.keys.forEach(function (key, idx) {
			vals[key] = (row[key] != null ? row[key] : null);
		});
		return this.deleteByExample(table, vals, connection, java.sql.Statement.NO_GENERATED_KEYS);
	}
};
