// declare all the module
angular.module("kendo.directives", []);
angular.module('kendo.directives', [], function($provide){

  // Iterate over the kendo.ui and kendo.dataviz.ui namespace objects to get the Kendo UI widgets adding
  // them to the 'widgets' array. 
  var widgets = [];

  angular.forEach([kendo.ui, kendo.dataviz && kendo.dataviz.ui], function(namespace) {
    angular.forEach(namespace, function(value, key) {
      // add all widgets
      if( key.match(/^[A-Z]/) ){
        widgets.push("kendo" + key);
      }
    });
  });

  $provide.value('widgets', widgets);

});

angular.module('kendo.directives').factory('utils',
  function() {
    return {
      // simplistic reduce function
      reduce: function(obj, cb, memo) {
        angular.forEach(obj, function(value, key) {
          memo = cb.call(value, memo, value, key);
        });
        return memo;
      }
    };
  }
);
angular.module('kendo.directives').factory('widgetFactory', ['utils', function(utils) {

  // Gather the options from defaults and from attributes
  var gatherOptions = function(scope, element, attrs, controller, kendoWidget) {
    // TODO: add kendoDefaults value service and use it to get a base options object?
    // var options = kendoDefaults[kendoWidget];

    var dataSource;
    // make a deep clone of the options object passed to the directive, if any.
    var options = angular.copy(scope.$eval(attrs[kendoWidget])) || {};

    // Mixin the data that's set on the element in the options
    angular.forEach( element.data(), function(value, key) {
      // Only add data items that were put as attributes since some items put by angular and kendo
      // may have circular references and Kendo's deepCopyOne doesn't like that.
      if( !!attrs[key] ) {
        if( angular.isObject(value) ) {
          // Because this may be invoked on refresh (kendo-refresh) and that kendo may 
          // have modified the object put in the element's data,
          // we are parsing the attribute value to get the inital value of the object
          // and not the potentially modified one. 
          options[key] = JSON.parse(attrs[key]);
        } else {
          // Natives are immutable so we can just put them in.
          options[key] = value;
        }
      }
    });

    // If no dataSource was provided, 
    if( !options.dataSource ) {
      // Check if one was set in the element's data or in its ancestors.
      dataSource = element.inheritedData('$kendoDataSource');
      if( dataSource ) {
        options.dataSource = dataSource;
      }
    }

    // Add on-* event handlers to options.
    addEventHandlers(options, scope, attrs);

    // TODO: invoke controller.decorateOptions to allow other directives (or directive extensions)
    //       to modify the options before they get bound. This would provide an extention point for directives
    //       that require special processing like compiling nodes generated by kendo so that angular data binding
    //       can happen in kendo widget templates for example.
    //controller.decorateOptions(options);

    return options;

  };

  // Create an event handler function for each on-* attribute on the element and add to dest.
  var addEventHandlers = function(dest, scope, attrs) {
    var memo,
        eventHandlers = utils.reduce(attrs, function(memo, attValue, att) {
      var match = att.match(/^on(.+)/), eventName, fn;
      if( match ) {
        // Lowercase the first letter to match the event name kendo expects.
        eventName = match[1].charAt(0).toLowerCase() + match[1].slice(1);
        // Parse the expression.
        fn = $parse(attValue);
        // Add a kendo event listener to the memo.
        memo[eventName] = function(e) {
          // Make sure this gets invoked in the angularjs lifecycle.
          scope.$apply(function() {
            // Invoke the parsed expression with a kendoEvent local that the expression can use.
            fn(scope, {kendoEvent: e});
          });
        };
      }
      return memo;
    }, {});

    // mix the eventHandlers in the options object
    angular.extend(dest, eventHandlers);
  };

  // Create the kendo widget with gathered options
  var create = function(scope, element, attrs, controller, kendoWidget) {

    // Create the options object
    var options = gatherOptions(scope, element, attrs, controller, kendoWidget);

    // Bind the kendo widget to the element and return a reference to the widget.
    return element[kendoWidget](options).data(kendoWidget);
  };

  return {
    create: create
  };

}]);

angular.module('kendo.directives').factory('directiveFactory', ['widgetFactory',
  function(widgetFactory) {
    var create = function($parse, $timeout, kendoWidget) {

      return {
        // Parse the directive for attributes and classes
        restrict: 'AC',
        transclude: true,
        require: '?ngModel',
        controller: [ '$scope', '$attrs', '$element', '$transclude', function($scope, $attrs, $element, $transclude) {

          // Make the element's contents available to the kendo widget to allow creating some widgets from existing elements.
          $transclude(function(clone){
            $element.append(clone);
          });

          // TODO: add functions to allow other directives to register option decorators
        }],

        link: function(scope, element, attrs, ctrls) {

          // Widgets may be bound to the ng-model.
          if (ctrl) {
            var ngModel = ctrls[0],
            ctrl = ctrls[1]
          }
          
          var widget;

          // Q: Why is there a timeout here with no duration? Docs indicate it is 0 by default.
          // Bind kendo widget to element only once interpolation on attributes is done.
          $timeout( function() {

            // create the kendo widget and bind it to the element.
            widget = widgetFactory.create(scope, element, attrs, ctrl, kendoWidget);

            // if kendo-refresh attribute is provided, rebind the kendo widget when 
            // the watched value changes
            if( attrs.kendoRefresh ) {
              // watch for changes on the expression passed in the kendo-refresh attribute
              scope.$watch(attrs.kendoRefresh, function(newValue, oldValue) {
                if(newValue !== oldValue) {
                  // create the kendo widget and bind it to the element.
                  widget = widgetFactory.create(scope, element, attrs, ctrl, kendoWidget);
                }
              }, true); // watch for object equality. Use native or simple values.
            }

            // Cleanup after ourselves
            scope.$on( '$destroy', function() {
              widget.destroy();
            });

            // if ngModel is on the element, we setup bi-directional data binding
            if (ngModel) {
              if( !widget.value ) {
                throw new Error('ng-model used but ' + kendoWidget + ' does not define a value accessor');
              }

              // Angular will invoke $render when the view needs to be updated with the view value.
              ngModel.$render = function() {
                // Update the widget with the view value.
                widget.value(ngModel.$viewValue);
              };

              // In order to be able to update the angular scope objects, we need to know when the change event is fired for a Kendo UI Widget.
              widget.bind("change", function(e) {
                scope.$apply(function() {
                  // Set the value on the scope to the widget value. 
                  ngModel.$setViewValue(widget.value());
                });
              });
            }
          });
        }
      };
    };

    return {
      create: create
    };
}]);
(function(angular) {

  var widgets = angular.injector(['kendo.directives']).get('widgets');

  // loop through all the widgets and create a directive
  angular.forEach(widgets, function(widget) {
    angular.module('kendo.directives').directive(widget, ['$parse', '$timeout', 'directiveFactory',
      function($parse, $timeout, directiveFactory) {
        return directiveFactory.create($parse, $timeout, widget);
      }
    ]);
  });

}(angular));


// ## The kendoSource directive allows setting the Kendo UI DataSource of a widget directly from the HTML.
angular.module('kendo.directives').directive('kendoSource', [function() {

  // Transforms the object into a Kendo UI DataSource.
  var toDataSource = function(ds) {
    // TODO: if ds is a $resource, wrap it in a kendo dataSource using an injected service
    return kendo.data.DataSource.create(ds);
  };

  return {
    // This is an attribute directive
    restrict: 'A',
    controller: ['$scope', '$attrs', '$element', function($scope, $attrs, $element) {
      // Set $kendoDataSource in the element's data. 3rd parties can define their own dataSource creation
      // directive and provide this data on the element.
      $element.data('$kendoDataSource', toDataSource($scope.$eval($attrs.kendoSource)));

      // Keep the element's data up-to-date with changes.
      $scope.$watch($attrs.kendoSource, function(newDS, oldDS) {
        if( newDS !== oldDS ) {
          $element.data('$kendoDataSource', toDataSource(newDS));
        }
      });
    }]
  };

}]);