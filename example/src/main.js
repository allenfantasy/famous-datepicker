/* globals define */
define(function(require, exports, module) {
  'use strict';
  // import dependencies
  var Engine = require('famous/core/Engine');
  var Modifier = require('famous/core/Modifier');
  var Transform = require('famous/core/Transform');
  var Transitionable = require('famous/transitions/Transitionable');
  var AppView = require('views/AppView');
  var DatepickerView = require('views/DatepickerView');

  var mainContext = Engine.createContext();

  var state = new Transitionable(0);

  var color = '#627699';

  var appView = new AppView(color);
  var datepickerView = new DatepickerView();
  var toggler = require('views/togglerView');

  // datepicker mask
  mainContext.add(new Modifier({
    transform: function() {
      return Transform.translate(0, (1 - state.get())*window.innerHeight, 10);
    }
  })).add(datepickerView);

  // appView
  mainContext.add(new Modifier({
    origin: [0.5, 0.5],
    align: [0.5, 0.5]
  })).add(appView);

  // toggler
  mainContext.add(new Modifier({
    origin: [0.5, 0],
    align: [0.5, 0]
  })).add(toggler);

  // events
  appView.input.on('click', function() {
    state.set(1, { duration: 1000, curve: 'easeIn' });
  });

  datepickerView.on('confirm', function(date) {
    // set date
    state.set(0, { duration: 1000, curve: 'easeOut' });
    var month = date.getMonth() + 1;
    var day = date.getDate();
    month = month<10?'0'+month:month;
    day = day<10?'0'+day:day;
    var dateStr = date.getFullYear() + '-' + month + '-' + day;
    appView.input.setContent(dateStr);
  });

  datepickerView.on('cancel', function() {
    state.set(0, { duration: 1000, curve: 'easeOut' });
  });

  toggler.submit.on('click', function() {
    var startYear = parseInt(toggler.getStartYear());
    var endYear = parseInt(toggler.getEndYear());
    datepickerView.datePicker.setYears(startYear, endYear);
  });

});
