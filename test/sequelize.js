'use strict';

let config = {
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'admin',
  database: process.env.DB_NAME || 'films',
  host: process.env.DB_HOST || 'pg-search-sequelize-test-db',
  port: process.env.DB_PORT || '5432',
  dialect: 'postgres'
};

let SearchModel = require('../');
let Sequelize = require('sequelize');
let sequelize = new Sequelize(config.database, config.username, config.password, config);

let Film = sequelize.define('Film', {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, field: 'film_id' },
  title: { type: Sequelize.STRING, allowNull: false },
  description: { type: Sequelize.TEXT, allowNull: false },
  releaseYear: { type: Sequelize.INTEGER, allowNull: false, field: 'release_year' },
  length: Sequelize.INTEGER,
  rating: Sequelize.STRING,
}, {
  tableName: 'film',
  timestamps: false,
});

let FilmMaterializedView = sequelize.define('FilmMaterializedView', {
  id: {type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, field: 'film_id'},
  title: Sequelize.STRING,
  description: Sequelize.TEXT,
  releaseYear: Sequelize.INTEGER,
  rating: Sequelize.STRING,
  document: Sequelize.TEXT
}, {
  tableName: 'film_materialized_view',
  timestamps: false
});
FilmMaterializedView.referenceModel = Film;
new SearchModel(FilmMaterializedView);

let Actor = sequelize.define('Actor', {
  id: {type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, field: 'actor_id'},
  name: {type: Sequelize.STRING(45), allowNull: false}
}, {
  tableName: 'actor',
  timestamps: false
});

let FilmActor = sequelize.define('FilmActor', {}, {
  tableName: 'film_actor',
  timestamps: false
});
FilmActor.removeAttribute('id');

Film.belongsToMany(Actor, {
  through: FilmActor,
  as: 'Actors',
  foreignKey: {
    name: 'film_id',
    allowNull: false
  },
  otherKey: 'actor_id'
});
Film.hasMany(FilmActor, { foreignKey: { name: 'film_id', allowNull: false } });

Actor.belongsToMany(Film, {
  through: FilmActor,
  as: 'Films',
  foreignKey: {
    name: 'actor_id',
    allowNull: false
  },
  otherKey: 'film_id'
});
Actor.hasMany(FilmActor, { foreignKey: { name: 'actor_id', allowNull: false } });

FilmActor.belongsTo(Actor, { foreignKey: { name: 'actor_id', allowNull: false } });
FilmActor.belongsTo(Film, { foreignKey: { name: 'film_id', allowNull: false } });

module.exports = sequelize;
