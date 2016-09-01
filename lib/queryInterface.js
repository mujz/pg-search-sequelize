'use strict';

let Sequelize = require('sequelize');
let QueryGenerator = require('./queryGenerator');
let Util = require('../util');

class QueryInterface {

  constructor(queryInterface) {
    this.queryInterface = queryInterface;
  }

  createMaterializedView (materializedViewName, model, attributes, options) {
    options = options || {};
    options.tableName = options.tableName || model.tableName;
    this.document = [];
    this.query = new QueryGenerator()
      .createMaterializedView(materializedViewName)
      .from(model);
    return this.buildDocument(model, attributes, options).then(() => {

      let fields = {
        document: {raw: this.document.join(' || '), as: 'document'}
      };
      fields[options.primaryKeyField || model.primaryKeyField] = {model: options};

      return this.queryInterface.sequelize.query(this.query.select(fields).getQuery())
    });
  }

  dropMaterializedView(materializedViewName) {
    return this.queryInterface.sequelize.query(`DROP MATERIALIZED VIEW ${materializedViewName};`);
  }

  buildDocument(includeOrModel, attributes, options) {
    let include = includeOrModel, model = includeOrModel, isInclude = false;
    if (!(model instanceof Sequelize.Model)) {
      model = model.model;
      isInclude = true;
    }
    let allowNull = undefined;
    if (!Util.isEmptyObject(options.modelDescription))
      allowNull = options.modelDescription[include.foreignKey] ? options.modelDescription[include.foreignKey].allowNull : true;

    return model.describe().then(modelDescription => {
      if (!Util.isEmptyObject(attributes)) {
        this.document = this.document.concat(this.buildDocumentFromAttributes(attributes, modelDescription, include.as || model.tableName, allowNull));
      }
      if (isInclude) {
        let foreignKey = QueryGenerator.col(include.foreignKey, include.associationType === 'belongsTo' ? options.tableName : model.tableName);
        let targetKey = QueryGenerator.col(include.targetKey, include.associationType === 'belongsTo' ? model.tableName : options.tableName);
        this.query.leftOuterJoin(model, foreignKey, targetKey, include.as);
      }
      return this.buildDocumentFromInclude(isInclude ? include : options, isInclude ? model.tableName : options.tableName, modelDescription);
    })
  }

  buildDocumentFromAttributes(attributes, modelDescription, tableName, areNullable) {
    return Object.keys(attributes).map(key => {
      if (typeof attributes[key] === 'string') {
        let attr = modelDescription[key];
        let shouldCast =
          !(attr.type === 'TEXT' ||
          attr.type === 'CHARACTER VARYING' ||
          attr.type === 'CHARACTER');

        let column = QueryGenerator.col(key, tableName);
        if (shouldCast) column = QueryGenerator.cast(column);
        if (areNullable || attr.allowNull) column = QueryGenerator.coalesce(column).build();
        return QueryGenerator.setWeight(QueryGenerator.toTSVector(column).build(), attributes[key]).build();
      } else {
        throw new TypeError('Must be either a weight or attributes of model');
      }
    });
  };

  buildDocumentFromInclude(options, tableName, modelDescription) {
    if (!Util.isEmptyObject(options.include)) {
      return Array.isArray(options.include) ?
        Promise.all(options.include.map(include => this.buildDocument(include, include.attributes, {tableName, modelDescription}))) :
        this.buildDocument(options.include, options.include.attributes, {tableName, modelDescription});
    }
    return Promise.resolve();
  }
}

module.exports = QueryInterface;
