'use strict';

let Sequelize = require('sequelize');
let Util = require('../util');

let query;

class Fn {
  constructor(fn, args) {
    this.args = Array.from(arguments);
    this.fn = this.args.shift();
    return this;
  }

  build() {
    return this.fn + '(' + this.args.join(', ') + ')';
  }
}

class QueryGenerator {
  constructor() {
    this.query = {
      select: [],
      from: '',
      join: [],
      where: [],
      orderBy: []
    };
  }

  select(fields) {
    Object.keys(fields).forEach(key => this.query.select.push(QueryGenerator.col(key, fields[key].model, fields[key].as)));
    return this;
  }

  from(model) {
    this.model = model;
    this.query.from = ' FROM ' + QueryGenerator.table(model);
    return this;
  }

  leftOuterJoin(referenceModel, model) {
    this.query.join.push(`LEFT OUTER JOIN ${QueryGenerator.table(referenceModel)} ON ` +
      QueryGenerator.col(referenceModel.primaryKeyField, referenceModel) + ' = ' + QueryGenerator.col(model.primaryKeyField, model));
    return this;
  }

  where(fields) {
    Object.keys(fields).forEach(key => {
      let model = !Util.isEmptyObject(fields[key].model) ? fields[key].model : this.model;
      let operator = fields[key].operator;
      let field = QueryGenerator.col(model.attributes[key].field, model);
      let value = fields[key].value;

      if (operator === 'ilike') {
        operator = 'ILIKE';
        if ([Sequelize.STRING, Sequelize.CHAR, Sequelize.TEXT].every(type => !(model.attributes[key].type instanceof type)))
          field = QueryGenerator.cast(field);
        value = '%' + value + '%';
      }

      value = value instanceof Fn ? value.build() : '\'' + value + '\'';

      this.query.where.push(field + ' ' + operator + ' ' + value);
    });
    return this;
  }

  orderBy(fields) {
    Object.keys(fields).forEach(key => this.query.orderBy.push(
      fields[key][0] instanceof Fn ? fields[key][0].build() : fields[key][0] + ' ' + fields[key][1]));

    return this;
  }

  // ------------------
  // Getters
  // ------------------

  getSelect() {
    return 'SELECT ' + this.query.select.join(', ');
  }

  getFrom() {
    return this.query.from;
  }

  getJoin() {
    return this.query.join.join(' ');
  }

  getWhere() {
    return 'WHERE ' + this.query.where.join(' AND ');
  }

  getOrderBy() {
    return this.query.orderBy.length > 0 ? 'ORDER BY ' + this.query.orderBy.join(', ') : '';
  }

  getQuery() {
    return this.getSelect() + this.getFrom() + ' ' + this.getJoin() + ' ' + this.getWhere() + ' ' + this.getOrderBy() + ';';
  }

  // ------------------
  // Static Methods
  // ------------------

  static refreshMaterializedView(model) {
    return model.sequelize.query('REFRESH MATERIALIZED VIEW ' + QueryGenerator.table(model));
  }

  static buildDocument(includeOrModel, attributes, options) {
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
        if (query.document) query.document += ' || ';
        query.document += QueryGenerator.buildDocumentFromAttributes(attributes, modelDescription, include.as || model.tableName, allowNull);
      }
      if (isInclude) {
        let foreignKey = QueryGenerator.col(include.foreignKey, include.associationType === 'belongsTo' ? options.tableName : model.tableName);
        let targetKey = QueryGenerator.col(include.targetKey, include.associationType === 'belongsTo' ? model.tableName : options.tableName);
        query.joins += ` LEFT OUTER JOIN ${QueryGenerator.table(model.tableName)}${include.as ? ' AS ' + include.as : ''} ON ${foreignKey} = ${targetKey}`;
      }
      return QueryGenerator.buildDocumentFromInclude(isInclude ? include : options, isInclude ? model.tableName : options.tableName, modelDescription);
    })
  }

  static buildDocumentFromAttributes(attributes, modelDescription, tableName, areNullable) {
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
    }).join(' || ');
  }

  static buildDocumentFromInclude(options, tableName, modelDescription) {
    if (!Util.isEmptyObject(options.include)) {
      return Array.isArray(options.include) ?
        Promise.all(options.include.map(include => QueryGenerator.buildDocument(include, include.attributes, {tableName, modelDescription}))) :
        QueryGenerator.buildDocument(options.include, options.include.attributes, {tableName, modelDescription});
    }
    return Promise.resolve();
  }

  static setWeight(field, weight) {
    return new Fn('setweight', field, '\'' + weight + '\'');
  }

  static toTSVector(field) {
    return new Fn('to_tsvector', field);
  }

  static toTSQuery(query) {
    return new Fn('to_tsquery', '\'' + query.replace(/ /g, ' & ') + ':*\'');
  }

  static tsRank(tsVector, tsQuery) {
    return new Fn('ts_rank', tsVector, tsQuery.build());
  }

  static coalesce(field, fallback = '\'\'') {
    return new Fn('coalesce', field, fallback);
  }

  static cast(field, type = 'TEXT') {
    return field + '::' + type;
  }

  static col(field, model, as = '') {
    return `${model ? QueryGenerator.table(model) + '.' : ''}"${field}"${as ? ' AS "' + as + '"': ''}`;
  }

  static table(model) {
    return `"${typeof model === 'string' ? model : model.tableName}"`;
  }
}

module.exports = QueryGenerator;
