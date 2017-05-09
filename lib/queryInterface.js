'use strict';

let Sequelize = require('sequelize');
let QueryGenerator = require('./queryGenerator');
let Util = require('../util');

class QueryInterface {

  constructor(queryInterface) {
    this.queryInterface = queryInterface;
  }

  /**
   * Creates a new materialized view in the database that has two fields; id and document. The document field is a `ts_vector` of the concatenated text of all the specified attributes/fields to be searchable.
   * @param {string} materializedViewName The materialized view's name
   * @param {Object} model The model of the table to create the materialized view for.
   * @param {Object} attributes key-value pair with the key being the field's name and the value the weight of the field. Ex. {name: "A", description: "B", city: "C"}
   * @param {Object} [options]
   * @param {string} [options.tableName] override the `tableName` of the passed model
   * @param {string} [options.primaryKeyField] override the `primaryKeyField` of the passed model
   * @param {Array<Object>|Object} [options.include] associated models' attributes to include in the materialized view's document.
   * @param {Object} [options.include.model] the model to include
   * @param {string} [options.include.foreignKey] The foreignKey that points to the associated model. Note that based on the association type, the foreign key could be on the reference model or on the other model.
   * @param {string} [options.include.targetKey] The key that the foreignKey references.
   * @param {string} [options.include.associationType] The association type from the parent model's perspective. It must be `hasOne`, `hasMany`, or `belongsTo`.
   * @param {Object} [options.include.attributes] The attributes to include from the model and their weights.
   * @param {Object} [options.include.include] models associated to the included model.
   */
  createMaterializedView(materializedViewName, model, attributes, options) {
    options = options || {};
    options.tableName = options.tableName || model.tableName;
    let primaryKeyField = options.primaryKeyField || model.primaryKeyField;
    this.document = [];
    this.query = new QueryGenerator()
      .createMaterializedView(materializedViewName)
      .from(model)
      .groupBy(primaryKeyField, model);
    return this.buildDocument(model, attributes, options).then(() => {
      let fields = {
        document: {raw: this.document.join(' || '), as: 'document'}
      };
      fields[primaryKeyField] = {model: options};

      return this.queryInterface.sequelize.query(this.query.select(fields).getQuery())
    });
  }

  /**
   * Drops the materialized view
   * @param {string} materializedViewName The materialized view's name
   */
  dropMaterializedView(materializedViewName) {
    return this.queryInterface.sequelize.query(`DROP MATERIALIZED VIEW ${materializedViewName};`);
  }

  /**
   * Builds the TSVector attribute (document).
   * @param {Object} includeOrModel the model of the table to create the materializedView for or an include object
   * @param {Object} attributes attributes and their weights. @see {@link QueryInterface#createMaterializedView}
   * @param {Object} [options]
   * @param {String} [options.tableName] the name of the table of the passed model
   * @param {Boolean} [options.shouldAggregate] value to pass to the shouldAggregate of buildDocumentFromAttributes. @see {@link QueryInterface#buildDocumentFromAttributes}
   * @param {Object} [options.modelDescription] the description of the parent model if the includeOrModel is an include
   * @return {Promise} the raw SQL command that builds the document
   */
  buildDocument(includeOrModel, attributes, options) {
    let include = includeOrModel, model = includeOrModel, isInclude = false;
    if (options.isInclude) {
      model = include.model;
      isInclude = true;
    }
    let areNullable = undefined, shouldAggregate = options.shouldAggregate;
    if (!Util.isEmptyObject(options.modelDescription))
      areNullable = options.modelDescription[include.foreignKey] ? options.modelDescription[include.foreignKey].allowNull : true;

    return model.describe().then(modelDescription => {
      if (isInclude) {
        let foreignKey, targetKey, groupByField;
        if (include.associationType === 'belongsTo') {
          foreignKey = QueryGenerator.col(include.foreignKey, options.tableName);
          targetKey = QueryGenerator.col(include.targetKey, model.tableName);
          groupByField = include.targetKey;
        } else {
          foreignKey = QueryGenerator.col(include.foreignKey, model.tableName);
          targetKey = QueryGenerator.col(include.targetKey, options.tableName);
          groupByField = model.primaryKeyField;
          if (include.associationType === 'hasMany') {
            shouldAggregate = true;
          }
        }
        this.query.leftOuterJoin(model, foreignKey, targetKey, include.as);
        if (!shouldAggregate) this.query.groupBy(groupByField, include.as || model);
      }
      if (!Util.isEmptyObject(attributes)) {
        this.document = this.document.concat(this.buildDocumentFromAttributes(attributes, modelDescription,
          include.as || model.tableName, { areNullable, shouldAggregate }));
      }
      return this.buildDocumentFromInclude(isInclude ? Object.assign({shouldAggregate}, include) : options,
        isInclude ? model.tableName : options.tableName, modelDescription);
    })
  }

  /**
   * Builds the attributes to be added to the TSVector attribute (document).
   * @param {Object} attributes attributes and their weights. @see {@link QueryInterface#createMaterializedView}
   * @param {Object} modelDescription the description of the model to build the attributes of.
   * @param {String} tableName the name of the table the attributes belong to
   * @param {Object} [options]
   * @param {Boolean} [options.shouldAggregate] if true, the Postgres string_agg function is called on the attribute
   * @param {Boolean} [options.areNullable] overrides the isNullable value of each attribute and considers them all to be nullable.
   * @return {Array<String>} the raw SQL query the builds each attribute
   */
  buildDocumentFromAttributes(attributes, modelDescription, tableName, options = {}) {
    return Object.keys(attributes).map(key => {
      if (typeof attributes[key] === 'string') {
        let attr = modelDescription[key];
        let shouldCast =
          !(attr.type === 'TEXT' ||
          attr.type === 'CHARACTER VARYING' ||
          attr.type === 'CHARACTER');

        let column = QueryGenerator.col(key, tableName);
        if (shouldCast) column = QueryGenerator.cast(column);
        if (options.shouldAggregate) column = QueryGenerator.stringAggregate(column).build();
        if (options.areNullable || attr.allowNull) column = QueryGenerator.coalesce(column).build();
        return QueryGenerator.setWeight(QueryGenerator.toTSVector(column).build(), attributes[key]).build();
      } else {
        throw new TypeError('Must be either a weight or attributes of model');
      }
    });
  };

  /**
   * Parses the include object to build the document
   * @param {Object} options the include object or the options object passed to the createMaterializedView object
   * @param {Object} options.include the include object. @see {@link QueryInterface#createMaterializedView}'s documentation
   * @param {Boolean} [options.shouldAggregate] value to pass to the shouldAggregate of buildDocument. @see {@link QueryInterface#buildDocumentFromAttributes}
   * @param {String} tableName the name of the model's table
   * @param {object} modelDescription The description of the parent include model
   * @return {Promise} @see {@link QueryInterface#buildDocument}
   */
  buildDocumentFromInclude(options, tableName, modelDescription) {
    if (!Util.isEmptyObject(options.include)) {
      // If include is an array, call buildDocument on each one of them, otherwise call buildDocument for the include object.
      return Array.isArray(options.include) ?
        Promise.all(options.include.map(include => this.buildDocument(include, include.attributes, {tableName, modelDescription, isInclude: true}))) :
        this.buildDocument(options.include, options.include.attributes,
          {tableName, modelDescription, shouldAggregate: options.shouldAggregate, isInclude: true});
    }
    return Promise.resolve();
  }
}

module.exports = QueryInterface;
