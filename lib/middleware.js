/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var loginApi = require( "./loginapi" );

module.exports = function( makeModel, env ) {
  var qs = require( "querystring" ),
      userList = qs.parse( env.get( "ALLOWED_USERS" ), ",", ":" ),
      tags = require( "./tags" )(),
      Make = makeModel,
      lazyCheck = env.get( "USE_LAZY_ADMIN" );

  return {
    // Use with express.basicAuth middleware
    authenticateUser: function( user, pass ) {
      var found = false;
      Object.keys( userList ).forEach( function( username ) {
        if ( user === username && pass === userList[ username ] ) {
          found = true;
        }
      });
      return found;
    },
    prefixAuth: function( req, res, next ) {

      var makerID = req.body.maker,
          makeTags = req.body.make.tags,
          appTags = req.body.make.appTags,
          make = req.make;

      makeTags = typeof makeTags === "string" ? [makeTags] : makeTags;
      appTags = typeof appTags === "string" ? [appTags] : appTags;

      loginApi.isAdmin( makerID, function( err, isAdmin ) {
        if ( !lazyCheck && err ) {
          return res.json( 500, { error: err } );
        }

        var options = {
              maker: makerID,
              isAdmin: isAdmin
            },
            validTags = [];

        if ( makeTags ) {
           validTags = tags.validateTags( makeTags, options );
         }

        if ( appTags ) {
          validTags = validTags.concat( tags.validateApplicationTags( appTags, req.user ) );
        }

        // Preserve Application Tags on the original make & filter duplicates
        if ( make && make.tags ) {
          validTags = validTags.concat( make.tags.filter(function( tag ) {
            return ( /(^[^@]+)\:[^:]+/ ).test( tag );
          })).filter(function( tag, pos, arr ) {
            return arr.indexOf( tag ) === pos;
          });
        }

        req.body.make.tags = validTags;

        next();
      });
    },
    adminAuth: function( req, res, next ) {
      var email = req.session ? req.session.email : "";
      if ( email ) {
        loginApi.isAdmin( email, function( err, isAdmin ) {
          if ( err || !isAdmin ) {
            return res.redirect( 302, "/login" );
          }
          next();
        });
      } else {
        res.redirect( 302, "/login" );
      }
    },
    getMake: function( req, res, next ) {
      if ( !req.params.id ) {
        return res.json( 400, { status: "failure", reason: "ID missing"} );
      }
      Make.findById( req.params.id ).where( "deletedAt", null ).exec(function( err, make ) {
        if ( err ) {
          if ( err.name === "CastError" ) {
            return res.json( 400, { status: "failure", reason: "The supplied value does not look like a Make ID." } );
          } else {
            return res.json( 500, { status: "failure", reason: err.toString() } );
          }
        }
        if ( !make ) {
          return res.json( 400, { status: "failure", reason: "Make Does Not Exist" } );
        }
        req.make = make;
        next();
      });
    },
    errorHandler: function(err, req, res, next) {
      if (!err.status) {
        err.status = 500;
      }

      res.status(err.status);
      res.json(err);
    },
    fourOhFourHandler: function(req, res, next) {
      var err = {
        message: "You found a loose thread!",
        status: 404
      };

      res.status(err.status);
      res.json(err);
    }
  };
};
