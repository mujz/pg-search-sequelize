# PG Search - Sequelize 

Postgres full-text search in Node.js using sequelize as its ORM.

Check out the [Code Example](https://github.com/mujz/pg-search-sequelize-example).

# How It Works

This library makes use of Postgres full-text search and Materialized Views to run fast, powerful, and simple search queries.
It first creates a materialized view by concatenating all the values in the fields that you want to make searchable and converts them into a `ts_vector`. It then adds a `searchByText` and `search` class methods to your sequelize model, which enable you to run searches from a query string only, or a query string and an options JSON object. It also adds a `refresh` class method to refresh the materialized view when updates are made to your model or whenever you want. 

For example, let's assume we have a film database table which has:

| id | name                                  | description                       | city     | release_date | rating |
|----|---------------------------------------|-----------------------------------|----------|--------------|--------|
| 1  | The Fugitive                          | Another guy escapes from prison   | Chicago  | 1993-08-06   | 8      |
| 2  | A Beautiful Mind                      | A movie about a mathematician     | New York | 2001-12-05   | 8      |
| 3  | Chicago                               | A good ol' American musical       | Toronto  | 2002-12-10   | 7      |
| 4  | Eternal Sunshine of the Spotless Mind | Jim Carrey when he's not comedian | New York | 2004-03-19   | 8      |

We want to allow searching by name, description, and city, and filtering by rating and release_date. We also want to sort the results by relevance by giving the name field a higher weight than the description and city. So if you run the search:
 
```js
Film.searchByText("Chicago"); // Returns [ Chicago, The Fugitive ]
```

Results with the word "Chicago" in the title appear before those with the same word in the description or city. Thus the movie Chicago would appear first, and The Fugitive would be the second. 
 
We can also add filtering and ordering by a certain field instead of ordering by relevance by making the search query:
  
```js
Film.searchByText("Mind order:releaseDate"); // Returns [ A Beautiful Mind, Eternal Sunshine of the Spotless Mind ]
// or
Film.searchByText("Mind releaseDate:<2002-01-01"); // Returns [ A Beautiful Mind ]
```

You are also not limited to only the fields of one model; you can include fields from associated models too. For example, if we had another model in our database called Actor which is associated to Film by a foreign key, we can include fields from the actor model to be in the Film Materialized View. This allows us to run searches such as:

```js
Film.searchByText("Tom Hanks"); // Returns Tom Hanks movies
```

There's more you can do with this library. For further details on how to install and use it, Check out the [Install](#install) and [Usage](#usage) sections. For Documentation, check out the [Documentation](#documentation) section.


# Install

NPM install the `pg-search-sequelize` package

```bash
npm i --save pg-search-sequelize
```

Then require it in your materialized view model definition file and pass to it the sequelize model to make it searchable:

```js

let MyModel = sequelize.define(...); // your sequelize model definition 

let SearchModel = require('pg-search-sequelize'); // Require the pg-search-sequelize library
MyModel = new SearchModel(MyModel); // Construct a SearchModel out of the model you defined above. This adds `search`, `searchByText`, and `refresh` class methods to your model.

```

Please refer to [Usage](#usage) for how to define your model and how to create the Materialized View.

# Usage

Now that you got a sneak peek of what this library enables you at the end, let's get to the setup steps:

### 1. Create Materialized View

If you use the sequelize migrations tool, you can use the `createMaterializedView(name, referenceModel, attributes, options)` helper function provided by the `QueryInterface` class:

```js
const QueryInterface = require("pg-search-sequelize").QueryInterface;
const models = require("../models");

// The model we're creating the materialized view for
const referenceModel = models.Film;

const materializedViewName = "film_materialized_view";

const attributes = { // field: weight. Every field has a weight to calculate how relevant the search results are.
   name: "A", // name has the highest weight. 
   description: "B",
   city: "C" // city has a lower weight than title and description
}

const options = {
    include: [ // You can also include fields from associated models
        {
            model: models.Actor,
            foreignKey: "actor_id",
            targetKey: "id",
            associationType: "hasMany", // association types are: belongsTo, hasOne, or hasMany
            attributes: { // Those attributes get added to the materialized view's search document and will also be searched just like the other fields
              first_name: "D",
              last_name: "D",
              date_of_birth: "D"
            }
        }
    ]
}
module.exports: {
    up: queryInterface => new QueryInterface(queryInterface).createMaterializedView(materializedViewName, referenceModel, attributes, options),
    
    down: queryInterface => new QueryInterface(queryInterface).dropMaterializedView(materializedViewName)
}
```

If you don't use the sequelize migration tool, feel free to create the materialized view in whatever way you prefer.

### 2. Define Materialized View Model

Define the model of your materialized view the same way you define any other sequelize models. The only difference is that you need to add `referenceModel` property to your model definition options. Then just construct a `SearchModel` out of the materialized view model you just defined.

```js
let SearchModel = require("pg-search-sequelize");

let FilmMaterializedView = sequelize.define('FilmMaterializedView', {
    name: DataTypes.STRING,
    rating: DataTypes.INTEGER,
    document: DataTypes.TEXT
}, {
    referenceModel: models.Film // The model for which we're defining the materialized view
});

FilmMaterializedView = new SearchModel(FilmMaterializedView); // Adds search, searchByText, and refresh class methods to the model.
```

### 3. That's It!

Now you can call `materializedViewModel.search(query, options)` or `materializedViewModel.searchByText(query)` to run a full-text search on your model and its associations.

```js
models.Film.searchByText("Mind"); // Returns [ A Beautiful Mind, Eternal Sunshine of the Spotless Mind ]

// The following command searches for instances that match the search query,
// filters by those with releaseDate later than 2002, and orders the results by name field
models.Film.searchByText("Mind releaseDate:>2002 order:name"); // Returns [ Eternal Sunshine of the Spotless Mind ]

// Or if you don't like strings, you can pass those properties in a JSON object
// The following returns the same as the code above; i.e. [ Eternal Sunshine of the Spotless Mind ]
models.Film.search("Mind", {
    where: {
        releaseDate: {operator: ">", value: "2002-01-01"} 
    },
    order: [["name", "ASC"]]
}
```

Don't forget to refresh the materialized view to update it with the latest changes made to your model. One way to do that is to create an afterCreate, afterUpdate, and afterDelete hook on your model to refresh the materialized view:

```js
sequelize.define('Film', attributes, {
    hooks: {
        afterCreate: () => FilmMaterializedView.refresh(),
        afterUpdate: () => FilmMaterializedView.refresh(),
        afterDelete: () => FilmMaterializedView.refresh()
    }
});
```

Alternatively, you can have a job scheduler that refreshes your materialized view every x amount of time.

Head on to the [Documentation](#documentation) section to learn about what kind of searches you can make.

# Documentation

PG Search - Sequelize has 2 classes, `SearchModel` and `QueryInterface`.

### SearchModel

The `SearchModel` class is what you'd use to add the search and refresh class methods to your materialized view sequelize model. To access the `SearchModel` class `require("pg-search-sequelize")`. The following functions can be called from the model that you construct with the SearchModel class `MyModel = new SearchModel(MyModel)`

#### search(query, options)

Search materialized view model using a search query string and an options object.

###### Arguments

- `query` - the search query string.
- `options`
    - `where` - filters to limit the results by. 
    ```js
    /* 
    Format:
    options.where = {
       attribute: { 
           operator: ">, <, =, >=, <=, @@, ilike, etc.", 
           value: "some value" 
    }
    */
    // Example:
    options.where = {
        releaseDate: {
            operator: ">", 
            value: "2012-01-01"
        } 
    }
    ```
    - `attributes` - An array of the attributes to return. ex. 
    ```js 
    options.attributes = ["name", "releaseDate", "rating"]
    ```
    - `order` - An array of arrays with the first value being the attribute name and the second being the direction. For example: 
    ```js
    options.order = [
        ["name", "ASC"],
        ["releaseDate", "DESC"],
        ["rating", "DESC"]
    ]
    ```
    
###### Returns

`Promise` - An array of the search results instances with the attributes specified in the options object, the `defaultScope` of the materialized view model, or all the attributes in the materialized view model definition.

#### searchByText(query)

Search materialized view model with a text query only. This is especially useful for exposing a search API endpoint to your model so you don't have to worry about parsing the search query string.

###### Arguments

- `query` - A string of the query text, filters, and field to order by.

```js
// --------------
// Simple search
// --------------
Film.searchByText("Beautiful"); // WHERE to_tsquery('Beautiful') @@ document

// --------------
// Ordering
// --------------
// Search and order the results by rating in ascending order
Film.search("Beautiful order:rating"); // WHERE to_tsquery('Beatiful') @@ document ORDER BY ts_rank(document, to_tsquery('Beautiful')), rating ASC
// Or to invert the order to descending order, prepend the field name by an exclamation point
Film.searchByText("Beautiful order:!rating"); // WHERE to_tsquery('Beatiful') @@ document ORDER BY ts_rank(document, to_tsquery('Beautiful')), rating DESC

// --------------
// Filtering
// --------------
// Searches for a movie that has the text "Beautiful" in any of its fields and "brilliant mathematician" in the description. 
Film.searchByText("Beatiful description:brilliant mathematician"); // WHERE to_tsquery('Beatiful') @@ document AND description ILIKE %brilliant mathematician%

// You can also use comparison operators: =, >, <. >=, <=
Film.searchByText("Beautiful rating:>=7") // WHERE to_tsquery('Beautiful') @@ document AND rating >= 7

// If no operator is passed to the filter, an ILIKE operator is used. Just as seen in the first filtering example. 
// If the field's type doesn't work with ILIKE, it is cast to TEXT.
Film.searchByText("Beautiful releaseDate:200") // WHERE to_tsquery('Beautiful') @@ document AND release_date::TEXT ILIKE 200
```

###### Returns

`Promise` - An array of the search results instances with the `defaultScope` attributes of the materialized view model, or all the attributes in the materialized view model definition.

#### refresh()

Refreshes the materialized view. ex. `models.Film.afterCreate(() => MaterializedViews.Film.refresh())`

### QueryInterface

The `QueryInterface` class is meant for running migrations; i.e. creating and dropping the materialized view. To access the `QueryInterface` class `require("pg-search-sequelize").QueryInterface` in your `up` and `down` functions, construct an instance and pass to it the sequelize `queryInterface`:
```js
let QueryInterface = require("pg-search-sequelize").QueryInterface;

module.exports = {
    up: queryInterface => new QueryInterface(queryInterface).createMaterializedView(...),
    
    down: queryInterface => new QueryInterface(queryInterface).dropMaterializedView(...),
};
```

#### createMaterializedView(name, model, attributes, options)

Creates a new materialized view in the database that has two fields; id and document. The document field is a `ts_vector` of the concatenated text of all the specified attributes/fields to be searchable

###### Arguments

- `name` - The materialized view's name
- `model` - The model of the table to create the materialized view for.
- `attributes` - key-value pair object with the key being the field's name and the value the weight of the field.

```js
attributes = {
    name: "A" // "A" is the highest weight
    description: "B",
    release_date: "C"
    city: "D" // "D" is the lowest possible weight
}
```

- `options`
    - `tableName` - If provided, it override the `tableName` of the passed model
    - `primaryKeyField` - If provided, it override the `primaryKeyField` of the passed model
    - `include` - An array of objects that define associated models' attributes to include in the materialized view's document.
        
        ```js
        include = [
            {
                model: models.Actor,
                foreignKey: "actor_id",
                target_key: "id",
                associationType: "hasMany",
                attribtues: {
                    first_name: "C",
                    last_name: "C"
                },
                include: [...] // optionally you can include models associated to the Actor model
            },
            // ...
            // Other associated models
        ]
        ```
        
        - `model` - The model to include
        - `foreignKey` - The foreignKey that points to the associated model. Note that based on the association type, the foreign key could be on the reference model (the Film model in the example above) or on the other model (the Actor model).
        - `targetKey` - The key that the foreignKey references.
        - `associationType` - The association type from the reference model's (Film) perspective. It must be `hasOne`, `hasMany`, or `belongsTo`.
        - `attributes` - The attributes to include from the model.
        - `include` - An include array of models associated to the included model (ex. models associated to Actor)

#### dropMaterializedView(name)

Drops the materialized view.

###### Arguments

- `name` - The materialized view's name 
