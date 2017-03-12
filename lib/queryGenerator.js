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
  /**
   * Initializes the query instance variable
   */
  constructor() {
    this.query = {
      create: '',
      select: [],
      from: '',
      join: [],
      where: [],
      groupBy: [],
      orderBy: [],
      limit: -1,
      offset: 0
    };
  }

  /**
   * Creates a materialized view
   * @param {Object|String} model the model or its table name to create the materialized for
   * @return {QueryGenerator} queryGenerator
   */
  createMaterializedView(model) {
    this.query.create = QueryGenerator.table(model);
    return this;
  }

  /**
   * Adds the select clause of the query
   * @param {Object} fields the fields or values to add to the select query
   * @param {Object} [fields.model] the model this field belongs to
   * @param {Object} [fields.as] the alias to select the field as
   * @param {Object} [fields.raw] raw query to select
   * @return {QueryGenerator} queryGenerator
   */
  select(fields) {
    Object.keys(fields).forEach(key => this.query.select.push(
      fields[key].raw ? fields[key].raw + ' AS "' + fields[key].as + '"' : QueryGenerator.col(key, fields[key].model, fields[key].as))
    );
    return this;
  }

  /**
   * The model to select from
   * @param {Object} model
   * @return {QueryGenerator} queryGenerator
   */
  from(model) {
    this.model = model;
    this.query.from = QueryGenerator.table(model);
    return this;
  }

  /**
   * The reference model to left outer join
   * @param {Object} referenceModel the model to join
   * @param {Object|String} model to left outer join on or the foreignKey of the association
   * @param {String} [targetKey] the primary key that the foreign key references
   * @param {String} [as] what to left outer join this model as
   * @return {QueryGenerator} queryGenerator
   */
  leftOuterJoin(referenceModel, model, targetKey, as) {
    let firstKey = typeof model === 'string' ? model : QueryGenerator.col(referenceModel.primaryKeyField, referenceModel);
    let secondKey = targetKey ? targetKey : QueryGenerator.col(model.primaryKeyField, model);
    as = as ? ' AS "' + as + '"' : '';
    this.query.join.push('LEFT OUTER JOIN ' + QueryGenerator.table(referenceModel) + as + ' ON ' + firstKey + ' = ' + secondKey);
    return this;
  }

  /**
   * Adds the where claus of the query
   * @param {Object} attributes attributes, their values, and the operator
   * @param {Object} [attributes.model=this.model] the attribute model
   * @param {Object} attributes.operator the comparison operator
   * @param {Object} attributes.value the value to match against
   * @return {QueryGenerator} queryGenerator
   */
  where(attributes) {
    Object.keys(attributes).forEach(key => {
      let model = !Util.isEmptyObject(attributes[key].model) ? attributes[key].model : this.model;
      let operator = attributes[key].operator;
      let field = QueryGenerator.col(model.attributes[key].field, model);
      let value = attributes[key].value;

      if (operator === 'ilike') {
        operator = 'ILIKE';
        // If the operator is ILIKE and the field type is not String, Char, or Text, cast it to Text.
        if ([Sequelize.STRING, Sequelize.CHAR, Sequelize.TEXT].every(type => !(model.attributes[key].type instanceof type)))
          field = QueryGenerator.cast(field);
        value = '%' + value + '%';
      }

      value = value instanceof Fn ? value.build() : '\'' + value + '\'';

      this.query.where.push(field + ' ' + operator + ' ' + value);
    });
    return this;
  }

  /**
   * Adds the GROUP BY claus of the query
   * @param {string} field the field to group by
   * @param {object|string} [model] the model or table name the field belongs to
   * @return {QueryGenerator} queryGenerator
   */
  groupBy(field, model) {
    this.query.groupBy.push(model ? QueryGenerator.col(field, model) : field);
    return this;
  }

  /**
   * Adds the ORDER BY claus of the query
   * @param {Array<Array>} fields the fields and direction to order by. Ex [[field1, 'DESC'], [field2, 'ASC'], ['SQL Expression', 'DESC']].
   * @return {QueryGenerator} queryGenerator
   */
  orderBy(fields) {
    fields.forEach(field => this.query.orderBy.push(
      field[0] instanceof Fn ? field[0].build() + ' ' + field[1] : field[0] + ' ' + field[1]));
    return this;
  }

  /**
   * Adds LIMIT claus of the query
   * @param {int} max the maximum number of instances to return
   * @return {QueryGenerator} queryGenerator
   */
  limit(max) {
    this.query.limit = max;
    return this;
  }

  /**
   * Adds OFFSET claus of the query
   * @param {int} val the number of instances to skip from the beginning
   * @return {QueryGenerator}
   */
  offset(val) {
    this.query.offset = val;
    return this;
  }

  // ------------------
  // Getters
  // ------------------

  /**
   * Gets the CREATE claus
   * @return {string} CREATE calus
   */
  getCreate() {
    return this.query.create ? 'CREATE MATERIALIZED VIEW ' + this.query.create + ' AS' : '';
  }

  /**
   * Gets the SELECT clause
   * @return {string} SELECT clause
   */
  getSelect() {
    return this.query.select.length > 0 ? 'SELECT ' + this.query.select.join(', ') : '';
  }

  /**
   * Gets the FROM claus
   * @return {string} FROM claus
   */
  getFrom() {
    return this.query.from ? 'FROM ' + this.query.from : '';
  }

  /**
   * Gets all the different kinds of JOIN clauses
   * @return {string} JOINs claus
   */
  getJoin() {
    return this.query.join.length > 0 ? this.query.join.join(' ') : '';
  }

  /**
   * gets the WHERE claus
   * @return {string} WHERE claus
   */
  getWhere() {
    return this.query.where.length > 0 ? 'WHERE ' + this.query.where.join(' AND ') : '';
  }

  /**
   * Gets the ORDER BY claus
   * @return {string} ORDER BY claus
   */
  getOrderBy() {
    return this.query.orderBy.length > 0 ? 'ORDER BY ' + this.query.orderBy.join(', ') : '';
  }

  /**
   * Gets the LIMIT claus
   * @return {string} LIMIT claus
   */
  getLimit() {
    return this.query.limit >= 0 ? 'LIMIT ' + this.query.limit : '';
  }

  getOffset() {
    return this.query.offset > 0 ? 'OFFSET ' + this.query.offset : '';
  }

  /**
   * Gets the GROUP BY claus
   * @return {string} GROUP BY claus
   */
  getGroupBy() {
    return this.query.groupBy.length > 0 ? 'GROUP BY ' + this.query.groupBy.join(', ') : '';
  }

  /**
   * Gets the full query string
   * @return {string} query
   */
  getQuery() {
    return this.getCreate() + ' ' + this.getSelect() + ' ' + this.getFrom() + ' ' + this.getJoin() + ' ' +
      this.getWhere() + ' ' + this.getGroupBy() + ' ' + this.getOrderBy() + ' ' + this.getLimit() + this.getOffset() + ';';
  }

  // ------------------
  // Static Methods
  // ------------------

  /**
   * Refreshes the materialized view
   * @param {Object|String} model the materialized view's model or the materialized view's name
   */
  static refreshMaterializedView(model) {
    return model.sequelize.query('REFRESH MATERIALIZED VIEW ' + QueryGenerator.table(model));
  }

  /**
   * Postgres set_weight function. Adds weight to the field so we can sort the results by relevance
   * @param {String} field the field to set the weight of
   * @param {String} weight "A", "B", "C", or "D" weight of the field.
   * @return {Fn}
   */
  static setWeight(field, weight) {
    return new Fn('setweight', field, '\'' + weight + '\'');
  }

  /**
   * Postgres to_tsvector function. Converts the string/text to a tsvector
   * @param {String} field the field to set the weight of
   * @return {Fn}
   */
  static toTSVector(field) {
    return new Fn('to_tsvector', field);
  }

  /**
   * Postgres to_tsquery function. Converts string/text to a tsquery
   * @param {String} query the query to convert to tsquery
   * @return {Fn}
   */
  static toTSQuery(query) {
    return new Fn('to_tsquery', '\'' + query.replace(/ /g, ' & ') + ':*\'');
  }

  /**
   * Postgres ts_rank function. Ranks how close a tsquery matches a tsvector
   * @param {String} tsVector the tsvector field
   * @param {String} tsQuery the tsquery
   * @return {Fn}
   */
  static tsRank(tsVector, tsQuery) {
    return new Fn('ts_rank', tsVector, tsQuery.build());
  }

  /**
   * Postgres coalesce function. Sets a fallback value if a value is null.
   * @param {String} field the name of the field to coalesce the value of.
   * @param {String} [fallback="''"] the fallback text
   * @return {Fn}
   */
  static coalesce(field, fallback = '') {
    return new Fn('coalesce', field, '\'' + fallback + '\'');
  }

  /**
   * Postgres string_agg function. aggregates values of multiple rows into one.
   * @param {String} field the field to aggregate the values of
   * @param {String} [separator=", "] the separator to add among the values
   * @return {Fn}
   */
  static stringAggregate(field, separator = ', ') {
    return new Fn('string_agg', field, '\'' + separator + '\'');
  }

  /**
   * Postgres casting. Casts a field to a different type.
   * @param {String} field the field to cast
   * @param {String} [type='TEXT'] the type to cast to
   * @return {string} the field with the casting
   */
  static cast(field, type = 'TEXT') {
    return field + '::' + type;
  }

  /**
   * Converts a field into a column name. Ex. col(foo, fooModel, bar) returns "fooModel"."foo" AS "bar"
   * @param {String} field the field to get
   * @param {Model|String} [model] the model or table name that this field belongs to
   * @param {String} [as] the alias to give to that field
   * @return {String} the column
   */
  static col(field, model, as = '') {
    return `${model ? QueryGenerator.table(model) + '.' : ''}"${field}"${as ? ' AS "' + as + '"': ''}`;
  }

  /**
   * Gets table name from model or table name string
   * @param {Model|String} model or table name to get the name of.
   * @return {String} the table name
   */
  static table(model) {
    return `"${typeof model === 'string' ? model : model.tableName}"`;
  }
}

module.exports = QueryGenerator;
