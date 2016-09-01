'use strict';

let Sequelize = require('sequelize');
let Util = require('../util');

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
      create: '',
      select: [],
      from: '',
      join: [],
      where: [],
      orderBy: []
    };
  }

  createMaterializedView(model) {
    this.query.create = QueryGenerator.table(model);
    return this;
  }

  select(fields) {
    Object.keys(fields).forEach(key => this.query.select.push(
      fields[key].raw ? fields[key].raw + ' AS ' + fields[key].as : QueryGenerator.col(key, fields[key].model, fields[key].as))
    );
    return this;
  }

  from(model) {
    this.model = model;
    this.query.from = QueryGenerator.table(model);
    return this;
  }

  leftOuterJoin(referenceModel, model, targetKey, as) {
    let firstKey = typeof model === 'string' ? model : QueryGenerator.col(referenceModel.primaryKeyField, referenceModel);
    let secondKey = targetKey ? targetKey : QueryGenerator.col(model.primaryKeyField, model);
    as = as ? ' AS ' + as : '';
    this.query.join.push('LEFT OUTER JOIN ' + QueryGenerator.table(referenceModel) + as + ' ON ' + firstKey + ' = ' + secondKey);
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

  getCreate() {
    return this.query.create ? 'CREATE MATERIALIZED VIEW ' + this.query.create + ' AS' : '';
  }

  getSelect() {
    return this.query.select.length > 0 ? 'SELECT ' + this.query.select.join(', ') : '';
  }

  getFrom() {
    return this.query.from ? 'FROM ' + this.query.from : '';
  }

  getJoin() {
    return this.query.join.length > 0 ? this.query.join.join(' ') : '';
  }

  getWhere() {
    return this.query.where.length > 0 ? 'WHERE ' + this.query.where.join(' AND ') : '';
  }

  getOrderBy() {
    return this.query.orderBy.length > 0 ? 'ORDER BY ' + this.query.orderBy.join(', ') : '';
  }

  getQuery() {
    return this.getCreate() + ' ' + this.getSelect() + ' ' + this.getFrom() + ' ' + this.getJoin() + ' ' + this.getWhere() + ' ' + this.getOrderBy() + ';';
  }

  // ------------------
  // Static Methods
  // ------------------

  static refreshMaterializedView(model) {
    return model.sequelize.query('REFRESH MATERIALIZED VIEW ' + QueryGenerator.table(model));
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
