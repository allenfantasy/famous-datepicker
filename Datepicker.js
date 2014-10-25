define(function(require, exports, module) {
  var Surface = require('famous/core/Surface');
  var Modifier = require('famous/core/Modifier');
  var View = require('famous/core/View');
  var SequentialLayout = require('famous/views/SequentialLayout');
  var ContainerSurface = require('famous/surfaces/ContainerSurface');
  var Slot = require('./Slot');
  var Model = require('./helpers/NaiveModel');

  // TODO: options manager for Datepicker & Slot
  // TODO: initial active date
  // TODO: doc
  /**
   * @class Datepicker
   * @constructor
   *
   * @param {Object} options options for datepicker
   * @param {Array} options.size size
   * @param {Object} options.scroll options for each slot
   * @param {Number} options.range number of displayed item in each slot
   * @param {Number} options.fontSize fontSize of slot
   * @param {Object} options.year year range
   * @param {Number} options.year.start start year
   * @param {Number} options.year.end end year
   */
  function Datepicker(options) {
    View.apply(this, arguments);

    this.options = {};

    //TODO: deal with 'undefined'
    this.width = (options.size && options.size.length) ? options.size[0] : 200;
    this.height = (options.size && options.size.length) ? options.size[1] : 300;
    // TODO: custom scroll options
    this.scroll = options.scroll ? options.scroll : { direction: 1 };
    this.range = options.range ? options.range : 5;
    this.fontSize = options.fontSize ? options.fontSize : 16;
    if (typeof this.range !== 'number' || this.range % 2 !== 1) this.range = 5; // force to default value when invalid

    this.gap = (this.range - 1) / 2;

    this.options.year = options.year ? options.year : _getDefaultYearRange();

    var data = {};
    data.years = _getYDMItems(this.options.year.start, this.options.year.end, this.gap);
    data.months = _getYDMItems(1, 12, this.gap);
    data.days = _getYDMItems(1, 31, this.gap);

    this._model = new Model({
      year: data.years[this.gap],
      month: data.months[this.gap],
      day: data.days[this.gap]
    });

    this._slots = {};
    this._model.getKeys().forEach(function(key) {
      this._slots[key] = new Slot(data[key + 's'], this.width/3, this.height, this.range);
    }, this);

    var container = new ContainerSurface({
      size: [this.width, this.height],
      properties: {
        fontSize: this.fontSize + 'px'
      }
    });
    var layout = new SequentialLayout({ direction: 0 });

    var mask = new Surface({
      size: [this.width, this.height],
      classes: ['dp-mask']
    });

    var surfaces = Object.keys(this._slots).map(function(key) {
      return this._slots[key];
    }, this).map(function(slot) {
      return slot.container;
    });

    layout.sequenceFrom(surfaces);
    container.add(new Modifier({
      origin: [.5, .5],
      align: [.5, .5]
    })).add(mask);
    container.add(new Modifier({
      size: [this.width, this.height]
    })).add(layout);
    mask.pipe(layout);

    _setupEvent.call(this);

    this.add(container);
    return this;
  }

  Datepicker.prototype = Object.create(View.prototype);
  Datepicker.prototype.constructor = Datepicker;

  Datepicker.prototype.getDate = function() {
    this._model.set('year', this._slots.year.getValue());
    this._model.set('month', this._slots.month.getValue());
    this._model.set('day', this._slots.day.getValue());
    var month = this.getRegularMonth();
    var day = this.getRegularDay();
    var dateStr = this._model.get('year')  + '-' + month + '-' + day;
    return (new Date(dateStr));
  };

  Datepicker.prototype.getRegularMonth = function() {
    var month = this._slots.month.getValue();
    return (month >= 10 ? month : "0" + month);
  };

  Datepicker.prototype.getRegularDay = function () {
    var day = this._slots.day.getValue();
    return (day >= 10 ? day : "0" + day);
  }

  Datepicker.prototype.setYears = function(startYear, endYear) {
    var years = _getYDMItems(startYear, endYear, this.gap);
    this._model.set('year', years[this.gap]);
    this._slots['year'].sequenceFrom(years);
  };

  function _setupEvent() {
    // setup events
    Object.keys(this._slots).forEach(function(key) {
      var slot = this._slots[key];
      slot.on('change', function() {
        this._model.set(key, slot.getValue());
        // TODO: some buggy date should be prevented when pressing submit
        if (key !== 'day') {
          var daySlot = this._slots.day;
          var targetDays = this._getDays(); // the target amount of days
          var currentDays = daySlot.getItemCount();

          if (targetDays > currentDays)
            daySlot.addItems(currentDays + 1, targetDays);
          else if (targetDays < currentDays)
            daySlot.removeItems(targetDays + 1, currentDays);
          else
            return;
        }
      }, this);
    }, this);
  };

  /**
   * Get the number of days based on current year & month
   *
   * Get the last day of this month, and extract the `day` part
   *
   * @private
   * @return {Number} the number of days
   *
   */
  Datepicker.prototype._getDays = function _getDays() {
    var year = this._slots.year.getValue();
    // var month = this._slots.month.getValue();

    var d = new Date([this.getRegularMonth(), '01', year].join('/'));
    if (d.getMonth()>10) d.setFullYear(d.getFullYear()+1);
    d.setMonth((d.getMonth()+1)%12); // next month
    d.setDate(0); // back one day
    return parseInt(d.getDate());
  };

  function _getDefaultYearRange(range) {
    if (typeof range !== 'number') range = 10;
    range = range || 10;
    var d = parseInt(new Date().getFullYear());
    return {
      start: d - range + 1,
      end: d + range - 1
    };
  }

  // return the array of year/month/day
  function _getYDMItems(start, end, range) {
    if (start > end) return [];
    var array = [];
    for (var i = start; i <= end; i++) array.push(i);
    for (var j = 0; j < range; j++) {
      array.unshift(null);
      array.push(null);
    }
    return array;
  }

  module.exports = Datepicker;
});
