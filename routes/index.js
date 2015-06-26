var express = require('express');
var router = express.Router();

var path = require('path');
var mkpath = require('mkpath');

/* GET home page. */
//router.get('/', function(req, res, next) {
//  res.render('index', { title: 'Express' });
//});

/////////////////////////////////////////////////////////////////////
//        Model                                                    //
/////////////////////////////////////////////////////////////////////


var ObjectID = require('mongodb').ObjectID;
var fs = require('fs');

var mongoose = require('mongoose');
mongoose.connect("mongodb://localhost:27017/myproject");

var GallerySchema = new mongoose.Schema({
  name: String
});

var ImageSchema = new mongoose.Schema({
  gallery: String,
  path: String,
  likes: Number,
  comments: [{body: String, date: Date}],
  tags: Array
});

var Galleries = mongoose.model('Galleries', GallerySchema);
var Images = mongoose.model('Images', ImageSchema);

/////////////////////////////////////////////////////////////////////
//        Galleries                                                //
/////////////////////////////////////////////////////////////////////


router.get('/', function(req, res) {

  Galleries.find({}, function(err, docs) {
    if(err)
      throw err;
    res.render("index", {galleries: docs});
  });

});


router.post('/', function(req, res) {

  if(req.body.name === '') {
    res.redirect('/');
    return;
  }

  Galleries.update( {name: req.body.name }, {name: req.body.name }, {upsert: true}, function(err, doc) {
    if(err)
      throw err;
    res.redirect("/");
  });

});


router.get('/delete/:name', function(req, res) {

    Galleries.remove({ name: req.params.name }, function(err) {
      if(err)
        throw err;

      res.redirect("/");

      var galleryPath = path.join(__dirname, "../uploads/" + req.params.name);
      rmdirAsync(galleryPath, function(err) {
        //if(err) throw err;
      });      
    });

    Images.remove({gallery: req.params.name}, function(err) {
      if(err) throw err;
    });    

});


var rmdirAsync = function(rmpath, callback) {
  fs.readdir(rmpath, function(err, files) {
    if(err) {
      // Pass the error on to callback
      callback(err, []);
      return;
    }
    var wait = files.length,
      count = 0,
      folderDone = function(err) {
      count++;
      // If we cleaned out all the files, continue
      if( count >= wait || err) {
        fs.rmdir(rmpath,callback);
      }
    };
    // Empty directory to bail early
    if(!wait) {
      folderDone();
      return;
    }
    
    // Remove one or more trailing slash to keep from doubling up
    rmpath = rmpath.replace(/\/+$/,"");
    files.forEach(function(file) {
      var curPath = rmpath + "/" + file;
      fs.lstat(curPath, function(err, stats) {
        if( err ) {
          callback(err, []);
          return;
        }
        if( stats.isDirectory() ) {
          rmdirAsync(curPath, folderDone);
        } else {
          fs.unlink(curPath, folderDone);
        }
      });
    });
  });
};




/////////////////////////////////////////////////////////////////////
//        Images                                                   //
/////////////////////////////////////////////////////////////////////



router.get('/gallery/:name', function(req, res) {

  Images.find({gallery: req.params.name }, function(err, doc) {
    console.log(doc);
    if(err)
      throw err;

    //var imgName = path.basename(doc.path);
    //var imgPath = '/uploads/' + req.params.name + '/' + imgName;

    for(var i in doc) {
      doc[i].path = '/uploads/' + req.params.name + '/' + path.basename(doc[i].path);
    }


    res.render('gallery', {galleryName: req.params.name, images: doc});
  });

});


router.post('/gallery/:name', function(req, res) {

  //console.log(req.body);
  //console.log(req.files);
  if(req.files.uploadImg === undefined || req.files.uploadImg.size > 350000 ||
    req.files.uploadImg.mimetype.toString().indexOf('image') === -1) {
    res.redirect('/gallery/' + req.params.name);
    return;
  }


  fs.readFile(req.files.uploadImg.path, function (err, data) {

    var newPath = "../uploads/" + req.params.name;
    newPath = path.join(__dirname, newPath);
    mkpath.sync(newPath, 0700);
    var tmpPath = newPath;
    newPath += "/" + req.files.uploadImg.originalname;
    //console.log(newPath);
    if(fs.existsSync(newPath)) {
      newPath = tmpPath + '/' + Math.floor(Math.random() * 1000) + '_' + req.files.uploadImg.originalname;
      console.log(newPath);
    }

    fs.writeFile(newPath, data, function (err) {
      if(err)
        throw err;

      new Images({gallery: req.params.name, path: newPath, likes: '0'}).save(function(err) {
        if(err)
          throw err;
        res.redirect('/gallery/' + req.params.name);
        //delete from tmp folder
        fs.unlink(req.files.uploadImg.path, function(err) {
          if(err) throw err;
        });
      });
    });
  });

});


router.get('/gallery/:name/delete/:id', function(req, res) {

  var deletePath;
  Images.findOne({ _id: new ObjectID(req.params.id) }, function(err, doc) {
    if(err) throw err;
    deletePath = doc.path;
    console.log(deletePath);

    Images.remove({ _id: new ObjectID(req.params.id) }, function(err) {
      if(err) throw err;

      res.redirect("/gallery/" + req.params.name);

      fs.unlink(deletePath, function(err) {
        if(err) throw err;
      });
    });    
  });

});




/////////////////////////////////////////////////////////////////////
//        Comments, Likes, Tags                                    //
/////////////////////////////////////////////////////////////////////


router.get('/gallery/:name/:img', function(req, res) {

  Images.findOne({_id: new ObjectID(req.params.img)}, function(err, doc) {
    if(err) throw err;

    var imgName = path.basename(doc.path);
    var imgPath = '/uploads/' + req.params.name + '/' + imgName; //path.join(__dirname, '../public/images/' + imgName);
      
    res.render('image', {gallery: doc.gallery, imgName: imgName, imgPath: imgPath,
      imgId: doc._id, likes: doc.likes, comments: doc.comments, tags: doc.tags});
  })

});


router.get('/gallery/:name/:img/like/:value', function(req, res) {

  var value = 0;
  if(req.params.value === 'up') {
    value = 1;
  } else {
    value = -1;
  }

  Images.update({_id: new ObjectID(req.params.img)}, {$inc: {likes: value}}, function(err, doc) {
    if(err) throw err;

    res.redirect('/gallery/' + req.params.name + '/' + req.params.img);
  });

});


router.post('/gallery/:name/:img/tag', function(req, res) {

  if(req.body.tags === '') {
    res.redirect('/gallery/' + req.params.name + '/' + req.params.img);
    return;
  }

  Images.update({_id: new ObjectID(req.params.img)}, {$addToSet: {tags: req.body.tags}}, function(err, doc) {
    if(err) throw err;

    res.redirect('/gallery/' + req.params.name + '/' + req.params.img);
  });

});


router.post('/gallery/:name/:img/comment', function(req, res) {

  if(req.body.comment === '') {
    res.redirect('/gallery/' + req.params.name + '/' + req.params.img);
    return;
  }
  
  Images.update({_id: new ObjectID(req.params.img)}, {$push: {comments: {body: req.body.comment, date: new Date()}}}, function(err, doc) {
    if(err) throw err;

    res.redirect('/gallery/' + req.params.name + '/' + req.params.img);
  });

});

router.get('/gallery/:name/:img/deletetag/:tag', function(req, res) {

  Images.update({_id: new ObjectID(req.params.img)}, {$pull: {tags: req.params.tag}}, function(err, doc) {
    if(err) throw err;

    res.redirect('/gallery/' + req.params.name + '/' + req.params.img);
  });

})


router.get('/gallery/:name/:img/deletecomment/:comment', function(req, res) {

  Images.update({_id: new ObjectID(req.params.img)}, {$pull: {comments: {_id: new ObjectID(req.params.comment)}}}, function(err, doc) {
    if(err) throw err;

    res.redirect('/gallery/' + req.params.name + '/' + req.params.img);
  });

})




module.exports = router;
