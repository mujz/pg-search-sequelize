'use strict';

let QueryGenerator = require('./queryGenerator');
let Util = require('../util');

class SearchModel {
  /**
   * Adds search, searchByModel, and refresh class methods to the model.
   * @param {Object} model The sequelize model to turn into a SearchModel.
   * @return {Object} The mutated sequelize model
   */
  constructor(model) {
    // Add the allIndicesOf function to the string prototype
    Util.polyfillAllIndicesOf();

    model.search = (query, options) => SearchModel.search(model, query, options);
    model.searchByText = query => SearchModel.search(model, ...SearchModel.parseQuery(query));
    model.refresh = () => QueryGenerator.refreshMaterializedView(model);
    return model;
  }

  /**
   * Search materialized view model using a search query string and an options object.
   * @param {Object} model the sequelize mode of the materialized view to search
   * @param {String} [query] the search query
   * @param {Object} [options]
   * @param {Object} [options.where] filters to limit the results by. follows the format:
   * attribute: {
   *   operator: ">, <, >=, =, ILIKE, etc.",
   *   value: "Some Value"
   * }
   * @param {Object} [options.where.attribute] the name of the attribute to filter by
   * @param {String} [options.where.attribute.operator] the Postgresql comparison operator to use. Ex. =, >, <, >=, <=, ILIKE, etc.
   * @param {String|Number|Boolean} [options.where.attribute.value] the value to compare against.
   * @param {Array<String>} [options.attributes] An array of the attributes to return. Ex. ["name", "releaseDate", "rating"]
   * @param {Array<Array<String>>} [options.order] An array of arrays with the first value being the attribute name or value to order by and the second being the direction. Ex.
   * [
   *   ["name", "ASC"],
   *   ["releaseDate", "DESC"],
   *   ["rating", "DESC"]
   * ]
   * @return {Promise} An array of the search results' instances with the attributes specified in the options object, the `defaultScope` of the materialized view model, or all the attributes in the materialized view model definition.
   */
  static search(model, query, options = {}) {
    let referenceModel = model.referenceModel || model.options.referenceModel;

    // Convert query string to Postgres TSQuery
    if (query) query = QueryGenerator.toTSQuery(query);

    // Get the attributes from options.attributes or model's search scope attributes, or the model's default scope's attributes, or all the model's attributes
    let attributes = [];
    if (!Util.isEmptyObject(options.attributes)) attributes = options.attributes;
    else if (!Util.isEmptyObject(model.options.scopes.search)) attributes = model.options.scopes.search.attributes;
    else if (!Util.isEmptyObject(model.options.defaultScope)) attributes = model.options.defaultScope.attributes;
    else attributes = Object.keys(model.attributes);

    // Loop over the attributes to get their field names and assign the reference model to them. The fields object gets passed to the `select` clause of the query.
    let fields = {};
    attributes.forEach(attr => {
      if (attr !== 'document') fields[referenceModel.attributes[attr].field] = {
        model: referenceModel,
        as: attr
      }
    });

    // Set the where clause of the query from the query string and options.where.
    // Assign the reference model as the model to each options.where attribute
    let where = options.where || {};
    Object.keys(where).forEach(attr => where[attr].model = referenceModel);
    if (query) where.document = {operator: '@@', value: query};

    // Set the orderBy based on relevance (using Postgresql's tsRank) if no options.order is provided.
    // Change the first value of the array from attribute name to field name.
    let orderBy = options.order || [];
    orderBy.forEach(field => field[0] = QueryGenerator.col(referenceModel.attributes[field[0]].field, referenceModel));
    if (query && Util.isEmptyObject(options.order)) orderBy.unshift([QueryGenerator.tsRank(QueryGenerator.col('document', model), query), 'DESC']);

    query = new QueryGenerator()
      .from(model)
      .select(fields)
      .leftOuterJoin(referenceModel, model)
      .where(where)
      .orderBy(orderBy)
      .limit(options.limit)
      .offset(options.offset)
      .getQuery();

    let queryOptions = {type: model.sequelize.QueryTypes.SELECT};
    return model.sequelize.query(query, queryOptions);
  }

  /**
   * Parses the query string for the SearchModel.search method by assigning:
   * query - the remaining part of the query string after removing the filters and order values.
   * options.where - the attribute names that are followed by a colon and some value. If no comparison operator is passed after the colon, Postresql's ILIKE is used. Ex. "some query attribute_x:some query attribute_y:>25
   * options.order - order:the attribute to order the results by. Ex. "some query order:attribute" or "some query order:!attribute" to reverse the order by direction.
   * @param {String} [query] the query to parse.
   * @return {Array} the query and options to be passed to the SearchModel.search method.
   */
  static parseQuery(query) {
    let options = {
      where: {},
      order: [],
      limit: -1,
      offset: 0
    };
    query = query || '';

    // Get all the keys, which are words bound by a space on the left and a colon on the right; i.e. "some query key:value anotherKey:another value"
    let keys = query.allIndicesOf(':').map(index => query.substring(query.lastIndexOf(' ', index) + 1, index));

    keys.forEach((key, i) => {
      if (key) {
        // Gets the value of the key, which is the string bound by the colon after the key on the left and the next key or the end of the query string on the right.
        let originalValue = query.substring(query.indexOf(key) + key.length + 1, i < keys.length - 1 ? query.indexOf(keys[i+1]) : query.length);
        let value = originalValue.trim();
        let operator = '';

        if (key === 'order') {
          options.order.push(value.charAt(0) === '!' ? [value.substring(1), 'DESC'] : [value, 'ASC']);
        } else if (['=', '>', '<'].some(operator => operator === value.charAt(0))) {
          // If the operator is =, >, <, >=, or <= the set it as it is, otherwise set it to ILIKE.
          operator = value.charAt(1) === '=' ? value.substring(0, 2) : value.charAt(0);
          originalValue = value.substring(operator.length);
          value = originalValue.trim();
          options.where[key] = {operator, value};
        } else if (key === 'limit') {
          options.limit = parseInt(value);
        } else if (key === 'offset') {
          options.offset = parseInt(value);
        } else {
          options.where[key] = {operator: 'ilike', value};
        }

        // Remove the key:[operator]value from the query string.
        query = query.replace(key + ':' + operator + originalValue, '');
      }
    });

    return [query.trim(), options]
  }
}

module.exports = SearchModel;
