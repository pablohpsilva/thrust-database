/** @ignore */
var Statement = Java.type('java.sql.Statement');
/** @ignore */
var Timestamp = Java.type('java.sql.Timestamp');
/** @ignore */
var InitialContext = Java.type('javax.naming.InitialContext');

var ds = (function () {
	if (config.database && config.database.datasource) {
		var datasource = config.database.datasource;
		var initContext = new InitialContext();
		var ds = initContext.lookup(datasource);

		log.info("db connection pool initialized.");

		return ds;
	} else
		return null;
})();

/**
 * 
 * @author nery
 * @version 1.201703b02
 *
 * @desc Agrupa funcionalidades relativas a base de dados relacional.
 * @namespace db
 */
var db = {

	/**
	 * Executa uma função dentro de uma única transação.
	 * @param {Function} fncScript - função com vários acessos a banco de dados que recebe como parâmetros 
	 * um objecto com um único método *execute* equivalente ao `db.execute` e um objeto *context*.
	 * @param {Object} context - um objeto que será passado como segundo parâmetro da função *fncScript*.
	 * @returns {Object}
	 */
	executeInSingleTransaction: function (fncScript, context) {
		var rs = { error: false };
		var connection = db.getConnection();
		
		function execute(sql, args) {
			return db.execute(sql, args, connection);
		};

		var insert = function(table, rows) {
			return db.insert(table, rows, connection);
		};

		var update = function(table, row, where) {
			return db.update(table, row, where, connection);
		}

		var deleteFnc = function(table, row) {
			return db["delete"](table, row, connection);
		}

		var deleteByExample = function(table, row) {
			return db.deleteByExample(table, row, connection);
		}

		// commitOnReturn = typeof commitOnReturn !== 'undefined' ? commitOnReturn : true;

		try {
			connection.setAutoCommit(false)
			rs.result = fncScript({ execute: execute, insert: insert, "delete": deleteFnc, update: update, deleteByExample: deleteByExample}, context);
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
	},
	
	/**
	 * Retorna um objeto Connection que representa a conexão com o banco de dados. Esta API é exclusiva para uso  
	 * interno do BoxJS.
	 * @param {boolean} autoCommit - Utilizado para definir se a conexão com o banco deve fazer *commit*
	 * a cada execução de uma commando SQL.
	 * @returns {Connection}
	 */
	getConnection: function (autoCommit) {
		var connection = ds.getConnection();
		
		connection.setAutoCommit(autoCommit || false);

		return connection;
	},

	/**
	 * @desc Executa um <i>statement</i> SQL (DML).
	 * @param  {String} sql - O comando SQL a ser executado.
	 * @param {array} args - Lista de argumentos
	 * @param  {Connection} connection - Conex&atilde;o com o banco de dados.
	 * @returns {Object} No caso do comando ser um SELECT retorna um array de objetos
	 * ou caso contr&aacute;rio um objeto com a propriedade <i>error<i> valorada com um booleano 
	 * <i>true<i> ou <i>false<i> de acordo com o resultado da execu&ccedil;&atilde;o do comando SQL.
	 */
	execute: function (sql, args, connection) {
		var result;
		var conn = connection || db.getConnection(true);
		var hasSqlInject = sql.match(/[\t\r\n]|(--[^\r\n]*)|(\/\*[\w\W]*?(?=\*)\*\/)/gi);

		if (hasSqlInject == null) {
			var stmt = db.createPrepareStatement(sql, conn);
			result = stmt.execute(args);

			stmt.close();
			stmt = null;
		} else {
			result = {
				error: true,
				message: 'Attempt sql injection!'
			};
		}

		/* se a transação não existia e foi criada, precisa ser fechada para retornar ao pool */
		if (conn !== connection) {
			conn.close();
			ds.conn = conn = null;
		}

		return result;
	},

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
	insert : function (table, itens, connection){
		var conn = connection || db.getConnection(true);

		var sqlInsert = 'INSERT INTO ' + table + ' (';
		var values = ' VALUES (';
		var vrg = "",
			vals = [];

		if (itens.constructor.name == "Object")
			itens = [itens || {}];

		itens.forEach(function (tupla, idx) {
			var props = [];
			for (var key in tupla) {
				props.push(tupla[key]);
				if (idx == 0) {
					sqlInsert += vrg + key;
					values += vrg + "?";
					vrg = ",";
				}
			}
			vals.push(props);
		});

		sqlInsert += ') ' + values + ')';

		var result, stmt = db.createPrepareStatement(sqlInsert, conn);
		if (vals.length > 1)
			result = stmt.executeRows(vals);
		else
			result = stmt.execute(vals[0]);
		stmt.close();
		stmt = null;

		/* se a transação não existia e foi criada, precisa ser fechada para retornar ao pool */
		if (conn !== connection) {
			conn.close();
			ds.conn = conn = null;
		}

		return result;

	},


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
	update : function (table, row, where, connection) {
		var conn = connection || db.getConnection(true);

		var sql = 'UPDATE ' + table + ' SET ';
		var vrg = '',
			vals = [];
		for (var key in row) {
			vals.push(row[key]);
			sql += vrg + key + ' = ? ';
			vrg = ',';
		}

		var and = ' ';
		sql += ' WHERE ';
		if (where) {
			for (var key in where) {
				sql += and + key + " = ? ";
				and = " AND ";
				vals.push(where[key]);
			}
		} else {
			this.keys.forEach(function (key, idx) {
				sql += key + " = " + (row[key] || null);
			});
		}

		var stmt = db.createPrepareStatement(sql, conn);
		var result = stmt.execute(vals);
		stmt.close();
		stmt = null;

		/* se a transação não existia e foi criada, precisa ser fechada para retornar ao pool */
		if (conn !== connection) {
			conn.close();
			ds.conn = conn = null;
		}

		return result;
	},

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
	deleteByExample: function (table, row, connection) {
		var conn = connection || db.getConnection(true);

		var sql = 'DELETE FROM ' + table + ' WHERE 1=1 ';
		var vals = [];

		for (var key in row) {
			vals.push(row[key]);
			sql += ' AND ' + key + '= ?';
		}

		var stmt = db.createPrepareStatement(sql, connection, java.sql.Statement.NO_GENERATED_KEYS);
		var result = stmt.execute(vals);
		stmt.close();
		stmt = null;

		/* se a transação não existia e foi criada, precisa ser fechada para retornar ao pool */
		if (conn !== connection) {
			conn.close();
			ds.conn = conn = null;
		}

		return result;
	},

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

//..........................................................................................................................

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
						} catch(error) {
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
	},
	/**
	 * Encerra a transação e devolve a conexão utilizada para o datasource.
	 */
	close: function () {
		this.stmt.close();
		this.stmt = null;
	}
};

//..........................................................................................................................

/**
 * @class Table
 * 
 * Table &eacute; uma classe que representa uma tabela (entidade) de um banco de dados, encapsulando 
 * m&eacute;todos de manipula&ccedil;&aacute;o da tabela, tais como, INSET, UPDATE, DELETE e SELECT. 
 * @param {string} tblName O nome da tabela a ser manipulada.
 * @param {string} [keys = id]  As chaves primarias da tabela.
 * @constructor
 */
db.Table = function (tblName, keys) {
	this.tableName = tblName;
	this.keys = keys || ["id"];
};

/**
 * Executa um comando SQL
 * @param {String}  sql String com o comando sql a ser executado.
 * @param {Transaction}  [transaction]  Transação em que será executado os comandos.
 * @returns {Object} No caso do comando ser um SELECT retorna um array de objetos * 
 * ou caso contrário um objeto com a propriedade <i>error</i> valorada com um booleano 
 * <i>true</i> ou <i>false</i> de acordo com o resultado da execução do comando SQL.
 */
db.Table.execute = function (sql, transaction) {
	//java.lang.System.out.println(sql);
	var stmt = db.createPrepareStatement(sql, transaction, java.sql.Statement.NO_GENERATED_KEYS);
	var result = stmt.execute();
	stmt.close();
	return result;
};

/**
 * Realiza um comando replace no banco de dados.
 * @param {Object} tupla  Objeto a ser substituido.
 * @param {Transaction}  [transaction]  Transação em que será executado os comandos.
 * @returns {Object} result
 */
db.Table.prototype.replace = function (tupla, transaction) {
	var sqlReplace = 'REPLACE INTO ' + this.tableName + ' (';
	var values = ' VALUES (';
	var vrg = "",
		vals = [];

	for (var key in tupla) {
		vals.push(tupla[key]);
		sqlReplace += vrg + key;
		values += vrg + "?";
		vrg = ",";
	}
	sqlReplace += ') ' + values + ')';
	var stmt = db.createPrepareStatement(sqlReplace, transaction);
	var result = stmt.execute(vals);
	stmt.close();
	return result;
};

/**
 * Insere um ou mais objetos na tabela.
 * @param {Array|Object} itens - Array com objetos a serem inseridos na tabela, 
 * ou objeto único a ser inserido.
 * @param {Transaction} transaction - Transação em que será executado os comandos.
 * @return {Array|Object} Para inserção de varios itens retorna um Array de Objetos que 
 * indicam para cada item o resultado da execução do comando na base e a quantidade de linhas afetadas.
 * Para inserção de um único item retorna o id do item inserido.
 */
db.Table.prototype.insert = function (itens, transaction) { //}, returnGeneratedKey=true) {
	var sqlInsert = 'INSERT INTO ' + this.tableName + ' (';
	var values = ' VALUES (';
	var vrg = "",
		vals = [];

	if (itens.constructor.name == "Object")
		itens = [itens || {}];

	itens.forEach(function (tupla, idx) {
		var props = [];
		for (var key in tupla) {
			props.push(tupla[key]);
			if (idx == 0) {
				sqlInsert += vrg + key;
				values += vrg + "?";
				vrg = ",";
			}
		}
		vals.push(props);
	});

	sqlInsert += ') ' + values + ')';


	var result, stmt = db.createPrepareStatement(sqlInsert, transaction);
	if (vals.length > 1)
		result = stmt.executeRows(vals);
	else
		result = stmt.execute(vals[0]);
	stmt.close();
	return result;
};

/**
 * Atualiza dados da tabela no banco.
 * @param {Object} row- Dados das colunas a serem atualizadas no banco de dados.
 * @param {Object} where- Condição das colunas a serem atualizadas no banco de dados.
 * @param {Transaction} transaction - Transação na qual seráo realizados os comandos no banco de dados.
 * @example <caption>Para atualizar na tabela empresa o campo nroFuncionarios para 250, aonde
 * o nome da empresa é Softbox utilizamos o seguinte comando: </caption> 
 *  tempresa.update({nroFuncionarios: 250},{empresa: "Softbox"});
 * @returns {Object} Objeto que informa o status da execução do comando e a quantidade de
 * linhas afetadas.
 */
db.Table.prototype.update = function (row, where, transaction) {
	var sql = 'UPDATE ' + this.tableName + ' SET ';
	var vrg = '',
		vals = [];
	for (var key in row) {
		vals.push(row[key]);
		sql += vrg + key + ' = ? ';
		vrg = ',';
	}

	var and = ' ';
	sql += ' WHERE ';
	if (where) {
		for (var key in where) {
			sql += and + key + " = ? ";
			and = " AND ";
			vals.push(where[key]);
		}
	} else {
		this.keys.forEach(function (key, idx) {
			sql += key + " = " + (row[key] || null);
		});
	}

	var stmt = db.createPrepareStatement(sql, transaction);
	var result = stmt.execute(vals);
	stmt.close();
	return result;
};

/**
 * Remove itens do banco de dados de acordo com o objeto passado
 * @param {Object} row - Objeto que será usado como exemplo para realizar a consulta.
 * @param {Transaction} transaction - Transação na qual seráo realizados os comandos no banco de dados.
 * @example <caption> Para remover de banco de dados todas as empresas do estado de Minas Gerais
 *  utilizamos o seguinte comando: </caption> 
 *  tempresa.deleteByExample({estado: "MG"});
 * @returns {Object} Informa o status da execução do comando e a quantidade de
 * linhas afetadas.
 */
db.Table.prototype.deleteByExample = function (row, transaction) {
	var sql = 'DELETE FROM ' + this.tableName + ' WHERE 1=1 ';
	var vals = [];

	for (var key in row) {
		vals.push(row[key]);
		sql += ' AND ' + key + '= ?';
	}

	var stmt = db.createPrepareStatement(sql, transaction, java.sql.Statement.NO_GENERATED_KEYS);
	var result = stmt.execute(vals);
	stmt.close();
	return result;
};

/**
 * Remove determinado elemento do banco de dados, buscando o objeto por sua chave primaria.
 * @param {Object} row - Informação do objeto a ser removido
 * @param {Transaction} transaction - Transação na qual seráo realizados os comandos no banco de dados.
 * @returns Informa o status da execução do comando e a quantidade de linhas afetadas.
 */
db.Table.prototype["delete"] = function (row, transaction) {
	var vals = {};
	this.keys.forEach(function (key, idx) {
		vals[key] = (row[key] != null ? row[key] : null);
	});
	return this.deleteByExample(vals, transaction, java.sql.Statement.NO_GENERATED_KEYS);
};

/**
 * Seleciona determinado elemento do banco de dados, buscando o objeto por sua chave primaria.
 * @param {Object} row  Informação do objeto a ser buscado
 * @param {Transaction} transaction - Transação na qual serão realizados os comandos no banco de dados.
 * @returns {Array} Array que contem um objeto com o resultado da busca no banco de dados. 
 */
db.Table.prototype.selectByKey = function (row, transaction) {
	var vals = {};
	this.keys.forEach(function (key, idx) {
		vals[key] = (row[key] != null ? row[key] : null);
	});
	return this.selectByExample(vals);
};

/**
 * Busca itens do banco de dados de acordo com o objeto passado
 * @param {Object} row Objeto que será usado como exemplo para realizar a consulta.
 * @param {Transaction} transaction - Transação na qual serão realizados os comandos no banco de dados.
 * @example <caption> Para buscar no banco de dados todas as empresas do estado de Minas Gerais
 *  utilizamos o seguinte comando: </caption> 
 *  tempresa.selectByExample({estado: "MG"});
 * @returns {Object} Informa o status da execução do comando e a quantidade de
 * linhas afetadas.
 */
db.Table.prototype.selectByExample = function (row, transaction) {
	var sql = 'SELECT * FROM ' + this.tableName + ' WHERE 1=1 ';
	var _and_ = ' AND ';
	var vals = [];

	for (var key in row) {
		var val = row[key];
		vals.push(val);
		var op = "=";
		if (val == null) {
			op = " is ";
		} else if (val.constructor.name == "String" && val.indexOf('%') >= 0) {
			op = " like ";
		}
		sql += _and_ + key + op + " ? ";
	}
	var stmt = db.Database.createPrepareStatement(sql, transaction, java.sql.Statement.NO_GENERATED_KEYS);
	var result = stmt.execute(vals);
	stmt.close();
	return result;
};

db.Table.prototype.search = db.Table.prototype.selectByExample;

/**
 * Busca todos os itens da tabela no banco de dados
 * @param {Transaction} transaction - Transação na qual serão realizados os comandos no banco de dados.
 * @example <caption>Para buscar no banco de dados todas as empresas: </caption> 
 *  tempresa.all();
 * @returns {Array} Array com os objetos que representam os dados buscados no
 * banco de dados.
 */
db.Table.prototype.all = function (transaction) {
	var sql = 'SELECT * FROM ' + this.tableName;
	var stmt = db.Database.createPrepareStatement(sql, transaction, java.sql.Statement.NO_GENERATED_KEYS);
	var result = stmt.execute();

	stmt.close();

	return result;
};

/**
 * @param {FileInputStream} fis 
 * @param {int} size 
 */
function Blob(fis, size) {
	this.fis = fis;
	this.size = size;
}
