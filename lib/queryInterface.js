'use strict';

let QueryGenerator = require('./queryGenerator');

class QueryInterface {
  static createMaterializedView(queryInterface, materializedViewName, model, attributes, options) {
    options = options || {};
    let query = {
      document: '',
      joins: ''
    };
    options.tableName = options.tableName || model.tableName;
    let primaryKey = QueryGenerator.col(options.primaryKeyField || model.primaryKeyField, options.tableName);
    return QueryGenerator.buildDocument(model, attributes, options).then(() =>
      queryInterface.sequelize.query(
        `CREATE MATERIALIZED VIEW ${QueryGenerator.table(materializedViewName)} AS ` +
        `SELECT ${primaryKey}, ${query.document} AS document ` +
        `FROM ${QueryGenerator.table(model) + query.joins};`
      )
    );
  }

  static dropMaterializedView(queryInterface, materializedViewName) {
    return queryInterface.sequelize.query(`DROP MATERIALIZED VIEW ${materializedViewName};`);
  }
}

module.exports = QueryInterface;
