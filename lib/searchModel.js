'use strict';

let QueryGenerator = require('./queryGenerator');
let Util = require('../util');

class SearchModel {
  constructor(model) {
    Util.polyfillAllIndicesOf();

    model.search = (query, options) => SearchModel.search(model, query, options);
    model.searchByText = query => SearchModel.search(model, ...SearchModel.parseQuery(query));
    model.refresh = () => QueryGenerator.refreshMaterializedView(model);
    return model;
  }

  static search(model, query, options = {}) {
    let referenceModel = model.referenceModel;

    if (query) query = QueryGenerator.toTSQuery(query);

    let attributes = [];
    if (!Util.isEmptyObject(options.attributes)) attributes = options.attributes;
    else if (!Util.isEmptyObject(model.options.scopes.search)) attributes = model.options.scopes.search.attributes;
    else if (!Util.isEmptyObject(model.options.defaultScope)) attributes = model.options.defaultScope.attributes;
    else attributes = Object.keys(model.attributes);

    let fields = {};
    attributes.forEach(attr => {
      if (attr !== 'document') fields[referenceModel.attributes[attr].field] = {
        model: referenceModel,
        as: attr
      }
    });

    let where = options.where || {};
    Object.keys(where).forEach(field => where[field].model = referenceModel);
    if (query) where.document = {operator: '@@', value: query};

    let orderBy = options.order || [];
    orderBy.forEach(field => field[0] = QueryGenerator.col(referenceModel.attributes[field[0]].field, referenceModel));
    if (query) orderBy.unshift([QueryGenerator.tsRank(QueryGenerator.col('document', model), query), 'DESC']);

    query = new QueryGenerator()
      .from(model)
      .select(fields)
      .leftOuterJoin(referenceModel, model)
      .where(where)
      .orderBy(orderBy)
      .getQuery();

    let queryOptions = {type: model.sequelize.QueryTypes.SELECT};
    return model.sequelize.query(query, queryOptions);
  }

  static parseQuery(query) {
    let options = {
      where: {},
      order: []
    };
    query = query || '';

    let keys = query.allIndicesOf(':').map(index => query.substring(query.lastIndexOf(' ', index) + 1, index));

    keys.forEach((key, i) => {
      if (key) {
        let value = query.substring(query.indexOf(key) + key.length + 1, i < keys.length - 1 ? query.indexOf(keys[i+1]) : query.length).trim();

        if (key === 'order') {
          options.order.push(value.charAt(0) === '!' ? [value.substring(1), 'DESC'] : [value, 'ASC']);
        } else if (['=', '>', '<'].some(operator => operator === value.charAt(0))) {
          let operator = value.charAt(1) === '=' ? value.substring(0, 2) : value.charAt(0);
          value = value.substring(operator.length);
          options.where[key] = {operator, value};
        } else {
          options.where[key] = {operator: 'ilike', value};
        }

        query = query.replace(key + ':' + value, '');
      }
    });

    return [query.trim(), options]
  }
}

module.exports = SearchModel;