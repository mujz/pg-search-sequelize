'use strict';

let should = require("should");
let { models: { FilmMaterializedView } } = require('./sequelize');

module.exports = describe("search using a text query", () => {
  it("should find film by its title", done => {
    FilmMaterializedView.searchByText("Inception").then(films => {
      films[0].should.have.property("id", 15857);
      films[0].should.have.property("title", "Inception");
      done();
    });
  });

  it("should find film by its description", done => {
    FilmMaterializedView.searchByText("estranged daughter kidnapped").then(films => {
      films[0].should.have.property("id", 15988);
      films[0].should.have.property("title", "Taken");
      done();
    });
  });

  it("should limit results to 2 films", done => {
    FilmMaterializedView.searchByText("Washington limit:2").then(films => {
      films.length.should.equal(2);
      done();
    });
  });

  it("should return results 2 and 3", done => {
    FilmMaterializedView.searchByText("Washington limit:2").then(films => {
      films.length.should.equal(2);
      let secondFilm = films[1];
      FilmMaterializedView.searchByText("Washington limit:2 offset:1").then(films => {
        films[0].should.be.eql(secondFilm);
        done();
      });
    });
  });

  it("should filter by title", done => {
    FilmMaterializedView.searchByText("title:Leonardo").then(films => {
      films.forEach(film => {
        film.title.should.containEql("Leonardo");
      });
      done();
    });
  });

  it("should filter only films released after 2012", done => {
    FilmMaterializedView.searchByText("Tom Cruise releaseYear:>=2012").then(films => {
      films.forEach(film => {
        film.releaseYear.should.aboveOrEqual(2012);
      });
      done();
    });
  });

  it("should order movies by release year - ascending", done => {
    FilmMaterializedView.searchByText("title:the hangover order:releaseYear").then(films => {
      films[0].releaseYear.should.equal(2009);
      films[1].releaseYear.should.equal(2011);
      films[2].releaseYear.should.equal(2013);
      done();
    });
  });

  it("should order movies by release year - descending", done => {
    FilmMaterializedView.searchByText("title:the hangover order:!releaseYear").then(films => {
      films[0].releaseYear.should.equal(2013);
      films[1].releaseYear.should.equal(2011);
      films[2].releaseYear.should.equal(2009);
      done();
    });
  });
});

