function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

var PropTypes = require('prop-types');
var React = global.React || require('react');
var createReactClass = require('create-react-class');
var Formsy = {};
var validationRules = require('./validationRules.js');
var formDataToObject = require('form-data-to-object');
var utils = require('./utils.js');
var Mixin = require('./Mixin.js');
var HOC = require('./HOC.js');
var Decorator = require('./Decorator.js');
var options = {};
var emptyArray = [];

Formsy.Mixin = Mixin;
Formsy.HOC = HOC;
Formsy.Decorator = Decorator;
Formsy.validationRules = validationRules;

Formsy.defaults = function (passedOptions) {
  options = passedOptions;
};

Formsy.addValidationRule = function (name, func) {
  validationRules[name] = func;
};

Formsy.Form = createReactClass({
  displayName: 'Formsy',
  getInitialState: function () {
    return {
      isValid: true,
      isValidWithoutRequire: true,
      isSubmitting: false,
      canChange: false
    };
  },
  getDefaultProps: function () {
    return {
      onSuccess: function () {},
      onError: function () {},
      onSubmit: function () {},
      onValidSubmit: function () {},
      onInvalidSubmit: function () {},
      onValidSubmitIgnoreRequired: function () {},
      onValid: function () {},
      onInvalid: function () {},
      onChange: function () {},
      validationErrors: null,
      preventExternalInvalidation: false
    };
  },

  childContextTypes: {
    formsy: PropTypes.object
  },
  getChildContext: function () {
    return {
      formsy: {
        attachToForm: this.attachToForm,
        detachFromForm: this.detachFromForm,
        validate: this.validate,
        isFormDisabled: this.isFormDisabled,
        isValidValue: (component, value) => {
          return this.runValidation(component, value).isValid;
        }
      }
    }
  },

  // Add a map to store the inputs of the form, a model to store
  // the values of the form and register child inputs
  UNSAFE_componentWillMount: function () {
    this.inputs = [];
  },

  componentDidMount: function () {
    this.validateForm();
  },

  UNSAFE_componentWillUpdate: function () {
    // Keep a reference to input names before form updates,
    // to check if inputs has changed after render
    this.prevInputNames = this.inputs.map(component => component.props.name);
  },

  componentDidUpdate: function () {

    if (this.props.validationErrors && typeof this.props.validationErrors === 'object' && Object.keys(this.props.validationErrors).length > 0) {
      this.setInputValidationErrors(this.props.validationErrors);
    }

    var newInputNames = this.inputs.map(component => component.props.name);
    if (utils.arraysDiffer(this.prevInputNames, newInputNames)) {
      this.validateForm();
    }

  },

  // Allow resetting to specified data
  reset: function (data) {
    this.setFormPristine(true);
    this.resetModel(data);
  },

  // Update model, submit to url prop and send the model
  submit: function (event) {

    event && event.preventDefault();

    // Trigger form as not pristine.
    // If any inputs have not been touched yet this will make them dirty
    // so validation becomes visible (if based on isPristine)
    this.setFormPristine(false);
    var model = this.getModel();

    var handleSubmit = function() {
      this.props.onSubmit(model, this.resetModel, this.updateInputsWithError);
      if (this.state.isValid) {
        this.props.onValidSubmit(model, this.resetModel, this.updateInputsWithError);
      }
      else if (this.state.isValidWithoutRequire && !this.state.isValid) {
        this.props.onValidSubmitIgnoreRequired(model, this.resetModel, this.updateInputsWithError);
      }
      else {
        this.props.onInvalidSubmit(model, this.resetModel, this.updateInputsWithError);
      }
    }.bind(this);

    this.validateForm(handleSubmit);
  },

  mapModel: function (model) {

    if (this.props.mapping) {
      return this.props.mapping(model)
    } else {
      return formDataToObject.toObj(Object.keys(model).reduce((mappedModel, key) => {

        var keyArray = key.split('.');
        var base = mappedModel;
        while (keyArray.length) {
          var currentKey = keyArray.shift();
          base = (base[currentKey] = keyArray.length ? base[currentKey] || {} : model[key]);
        }

        return mappedModel;

      }, {}));
    }
  },

  getModel: function () {
    var currentValues = this.getCurrentValues();
    return this.mapModel(currentValues);
  },

  // Reset each key in the model to the original / initial / specified value
  resetModel: function (data) {
    this.inputs.forEach(component => {
      var name = component.props.name;
      if (data && data.hasOwnProperty(name)) {
        component.setValue(data[name]);
      } else {
        component.resetValue();
      }
    });
    this.validateForm();
  },

  setInputValidationErrors: function (errors) {
    this.inputs.forEach(component => {
      var name = component.props.name;
      var args = [{
        _isValid: !(name in errors),
        _validationError: typeof errors[name] === 'string' ? [errors[name]] : errors[name]
      }];
      component.setState.apply(component, args);
    });
  },

  // Checks if the values have changed from their initial value
  isChanged: function() {
    return !utils.isSame(this.getPristineValues(), this.getCurrentValues());
  },

   getPristineValues: function() {
    return this.inputs.reduce((data, component) => {
      var name = component.props.name;
      data[name] = component.props.value;
      return data;
    }, {});
  },

  // Go through errors from server and grab the components
  // stored in the inputs map. Change their state to invalid
  // and set the serverError message
  updateInputsWithError: function (errors) {
    Object.keys(errors).forEach((name, index) => {
      var component = utils.find(this.inputs, component => component.props.name === name);
      if (!component) {
        throw new Error('You are trying to update an input that does not exist. ' +
          'Verify errors object with input names. ' + JSON.stringify(errors));
      }
      var args = [{
        _isValid: this.props.preventExternalInvalidation || false,
        _externalError: typeof errors[name] === 'string' ? [errors[name]] : errors[name]
      }];
      component.setState.apply(component, args);
    });
  },

  isFormDisabled: function () {
    return this.props.disabled;
  },

  getCurrentValues: function () {
    return this.inputs.reduce((data, component) => {
      var name = component.props.name;
      data[name] = component.state._value;
      return data;
    }, {});
  },

  setFormPristine: function (isPristine) {
    this.setState({
      _formSubmitted: !isPristine
    });

    // Iterate through each component and set it as pristine
    // or "dirty".
    this.inputs.forEach((component, index) => {
      component.setState({
        _formSubmitted: !isPristine,
        _isPristine: isPristine
      });
    });
  },

  // Use the binded values and the actual input value to
  // validate the input and set its state. Then check the
  // state of the form itself
  validate: function (component) {

    // Trigger onChange
    if (this.state.canChange) {
      this.props.onChange(this.getCurrentValues(), this.isChanged());
    }

    var validation = this.runValidation(component);
    // Run through the validations, split them up and call
    // the validator IF there is a value or it is required
    component.setState({
      _isValid: validation.isValid,
      _isRequired: validation.isRequired,
      _isValidWithoutRequire: validation.isValidWithoutRequire,
      _validationError: validation.error,
      _externalError: null
    });
  },

  // Checks validation on current value or a passed value
  runValidation: function (component, value) {

    var currentValues = this.getCurrentValues();
    var validationErrors = component.props.validationErrors;
    var validationError = component.props.validationError;
    value = arguments.length === 2 ? value : component.state._value;

    var validationResults = this.runRules(value, currentValues, component._validations);
    var requiredResults = this.runRules(value, currentValues, component._requiredValidations);

    // the component defines an explicit validate function
    if (typeof component.validate === "function") {
      validationResults.failed = component.validate() ? [] : ['failed'];
    }

    var isRequired = Object.keys(component._requiredValidations).length ? !!requiredResults.success.length : false;
    var isValid = (!isRequired && (value === undefined || value === '' || value === false || value === null || (Array.isArray(value) && value.length == 0))) ||
      !validationResults.failed.length && !(this.props.validationErrors && this.props.validationErrors[component.props.name]);

    return {
      isRequired: isRequired,
      isValid: isRequired ? false : isValid,
      isValidWithoutRequire: isValid,
      error: (function () {

        if (isValid && !isRequired) {
          return emptyArray;
        }

        if (validationResults.errors.length) {
          return validationResults.errors;
        }

        if (this.props.validationErrors && this.props.validationErrors[component.props.name]) {
          return typeof this.props.validationErrors[component.props.name] === 'string' ? [this.props.validationErrors[component.props.name]] : this.props.validationErrors[component.props.name];
        }

        if (isRequired) {
          var error = validationErrors[requiredResults.success[0]];
          return error ? [error] : null;
        }

        if (validationResults.failed.length) {
          return validationResults.failed.map(function(failed) {
            return validationErrors[failed] ? validationErrors[failed] : validationError;
          }).filter(function(x, pos, arr) {
            // Remove duplicates
            return arr.indexOf(x) === pos;
          });
        }

      }.call(this))
    };

  },

  runRules: function (value, currentValues, validations) {

    var results = {
      errors: [],
      failed: [],
      success: []
    };
    if (Object.keys(validations).length) {
      Object.keys(validations).forEach(function (validationMethod) {

        if (validationRules[validationMethod] && typeof validations[validationMethod] === 'function') {
          throw new Error('Formsy does not allow you to override default validations: ' + validationMethod);
        }

        if (!validationRules[validationMethod] && typeof validations[validationMethod] !== 'function') {
          throw new Error('Formsy does not have the validation rule: ' + validationMethod);
        }

        if (typeof validations[validationMethod] === 'function') {
          var validation = validations[validationMethod](currentValues, value);
          if (typeof validation === 'string') {
            results.errors.push(validation);
            results.failed.push(validationMethod);
          } else if (!validation) {
            results.failed.push(validationMethod);
          }
          return;

        } else if (typeof validations[validationMethod] !== 'function') {
          var validation = validationRules[validationMethod](currentValues, value, validations[validationMethod]);
          if (typeof validation === 'string') {
            results.errors.push(validation);
            results.failed.push(validationMethod);
          } else if (!validation) {
            results.failed.push(validationMethod);
          } else {
            results.success.push(validationMethod);
          }
          return;

        }

        return results.success.push(validationMethod);

      });
    }

    return results;

  },

  // Validate the form by going through all child input components
  // and check their state
  validateForm: function (cb) {

    // We need a callback as we are validating all inputs again. This will
    // run when the last component has set its state
    var onValidationComplete = function () {
      var allIsValid = this.inputs.every(component => {
        return component.state._isValid;
      });

    var allIsValidWithoutRequire = this.inputs.every(component => {
        return component.state._isValidWithoutRequire;
      });

      this.setState({
        isValid: allIsValid,
        isValidWithoutRequire: allIsValidWithoutRequire,
        // Tell the form that it can start to trigger change events
        canChange: true
      }, function() {
        if (cb) cb();
      });

      if (allIsValid) {
        this.props.onValid();
      } else {
        this.props.onInvalid();
      }
    }.bind(this);

    // Run validation again in case affected by other inputs. The
    // last component validated will run the onValidationComplete callback
    this.inputs.forEach((component, index) => {
      var validation = this.runValidation(component);
      if (validation.isValid && component.state._externalError) {
        validation.isValid = false;
      }
      component.setState({
        _isValid: validation.isValid,
        _isRequired: validation.isRequired,
        _isValidWithoutRequire: validation.isValidWithoutRequire,
        _validationError: validation.error,
        _externalError: !validation.isValid && component.state._externalError ? component.state._externalError : null
      }, index === this.inputs.length - 1 ? onValidationComplete : null);
    });

    // If there are no inputs, set state where form is ready to trigger
    // change event. New inputs might be added later
    if (!this.inputs.length) {
      this.setState({
        canChange: true
      }, function() {
        if (cb) cb();
      });
    }
  },

  // Method put on each input component to register
  // itself to the form
  attachToForm: function (component) {

    if (this.inputs.indexOf(component) === -1) {
      this.inputs.push(component);
    }

    this.validate(component);
  },

  // Method put on each input component to unregister
  // itself from the form
  detachFromForm: function (component) {
    var componentPos = this.inputs.indexOf(component);

    if (componentPos !== -1) {
      this.inputs = this.inputs.slice(0, componentPos)
        .concat(this.inputs.slice(componentPos + 1));
    }

    this.validateForm();
  },
  render: function () {
    var _props = this.props;
    var mapping = _props.mapping;
    var validationErrors = _props.validationErrors;
    var onSubmit = _props.onSubmit;
    var onValid = _props.onValid;
    var onValidSubmit = _props.onValidSubmit;
    var onInvalid = _props.onInvalid;
    var onInvalidSubmit = _props.onInvalidSubmit;
    var onValidSubmitIgnoreRequired = _props.onValidSubmitIgnoreRequired;
    var onChange = _props.onChange;
    var reset = _props.reset;
    var preventExternalInvalidation = _props.preventExternalInvalidation;
    var onSuccess = _props.onSuccess;
    var onError = _props.onError;

    var nonFormsyProps = _objectWithoutProperties(_props, ['mapping', 'validationErrors', 'onSubmit', 'onValid', 'onValidSubmit', 'onInvalid', 'onInvalidSubmit', 'onValidSubmitIgnoreRequired', 'onChange', 'reset', 'preventExternalInvalidation', 'onSuccess', 'onError']);

    return React.createElement(
      'form',
      Object.assign({}, nonFormsyProps, { onSubmit: this.submit }),
      this.props.children
    );

  }
});

if (!global.exports && !global.module && (!global.define || !global.define.amd)) {
  global.Formsy = Formsy;
}

module.exports = Formsy;
