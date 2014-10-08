famous-datepicker
=================

Datepicker for Famo.us

## Getting Started

### Installation

Install it via bower: `bower install famous-datepicker`

### Usage

add the following in index.html:

```html
<link rel="stylesheet" type="text/css" href="lib/famous-datepicker/datepicker.css" />
```

add use Datepicker like this:
```javascript
var Datepicker = require('famous-datepicker/Datepicker');

var datepicker = new Datepicker({
  size: [200, 300],
  scroll: { direction: 1 },
  range: 3, // how many items displayed in each slot
  fontSize: 20, // fontSize
}) 
```

And here comes the [example demo](https://github.com/allenfantasy/famous-datepicker-example)

## Dependencies

- Famo.us v0.2.1+
- Grunt & Bower[of course!]

## Warning

Since there are some known bugs like [#205](https://github.com/Famous/famous/issues/205), [#250](https://github.com/Famous/famous/issues/250),
I've done some hack on it and make it a new `MyScrollview`, in order to keep the original Scrollview to use.

A simple implementation of Model called `NaiveModel` is used.

## TODO:

- Refactor all configuration things[may using OptionsManager]
- Improve performance
- Bump to a brand new version when Famo.us come to v0.0.3
- Custom themes
- Make it as circular using infinite scroll
