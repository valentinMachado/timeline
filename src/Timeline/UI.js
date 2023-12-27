import {
  localStorageBoolean,
  localStorageInt,
  isNumeric,
  localStorageString,
} from '../utils';
import { v4 as uuidv4 } from 'uuid';
import { TimelineDate } from './Date';

class LocalStorageDetails extends HTMLElement {
  constructor(id, summaryText) {
    super();

    this.details = document.createElement('details');
    this.details.classList.add('padded');
    this.appendChild(this.details);

    const summary = document.createElement('summary');
    summary.innerText = summaryText;
    this.details.appendChild(summary);

    this.details.open = localStorageBoolean(
      id + '_details_open',
      () => this.details.open
    );
  }
}

window.customElements.define('local-storage-details', LocalStorageDetails);

class LocalStorageInput extends HTMLElement {
  constructor(id, labelText, type, valueType, defaultValue) {
    super();

    this.classList.add('display_column');
    this.classList.add('padded');

    const label = document.createElement('label');
    label.innerText = labelText;
    this.appendChild(label);

    const uuid = uuidv4();
    label.htmlFor = uuid;

    /** @type {HTMLInputElement} */
    this.input = document.createElement('input');
    this.input.setAttribute('id', uuid);
    this.input.setAttribute('type', type);
    this.appendChild(this.input);

    if (valueType == LocalStorageInput.VALUE_TYPE.INTEGER) {
      const localStorageInteger = localStorageInt(id, () =>
        parseInt(this.input.value)
      );
      this.input.value = isNumeric(localStorageInteger)
        ? localStorageInteger
        : defaultValue;
    }
  }
}

// enum of value type for local storage input
LocalStorageInput.VALUE_TYPE = {
  INTEGER: 0,
};

window.customElements.define('local-storage-input', LocalStorageInput);

class LocalStorageSelect extends HTMLElement {
  constructor(id, labelText, options, defaultValue) {
    super();

    this.classList.add('display_column');
    this.classList.add('padded');

    const label = document.createElement('label');
    label.innerText = labelText;
    this.appendChild(label);

    const uuid = uuidv4();
    label.htmlFor = uuid;

    /** @type {HTMLSelectElement} */
    this.select = document.createElement('select');
    this.select.setAttribute('id', uuid);
    this.appendChild(this.select);

    options.forEach((option) => {
      const optionDomElement = document.createElement('option');
      optionDomElement.value = option;
      optionDomElement.innerText = option;
      this.select.appendChild(optionDomElement);
    });

    const optionSelected = localStorageString(
      id + '_option_selected',
      () => this.select.value
    );
    optionSelected && optionSelected !== ''
      ? (this.select.value = optionSelected)
      : (this.select.value = defaultValue);
  }
}

window.customElements.define('local-storage-select', LocalStorageSelect);

class TimelineDateSelector extends LocalStorageDetails {
  constructor(id, summaryText, defaultValue) {
    super(id, summaryText);

    this._value = new TimelineDate();

    /** @type {LocalStorageInput} */
    this.year = new LocalStorageInput(
      id + '_year',
      'Année: ',
      'number',
      LocalStorageInput.VALUE_TYPE.INTEGER,
      defaultValue.year
    );
    this.details.appendChild(this.year);

    /** @type {LocalStorageInput} */
    this.month = new LocalStorageSelect(
      id + '_month',
      'Mois: ',
      TimelineDate.MONTHS,
      TimelineDate.monthToString(defaultValue.month)
    );
    this.details.appendChild(this.month);

    /** @type {LocalStorageInput} */
    this.day = new LocalStorageInput(
      id + '_day',
      'Jour: ',
      'number',
      LocalStorageInput.VALUE_TYPE.INTEGER,
      defaultValue.day
    );
    this.details.appendChild(this.day);
  }

  magnetize() {
    this.year.input.value = TimelineDate.magnetizeYear(this.year.input.value);
    this.month.select.value = TimelineDate.monthToString(
      TimelineDate.magnetizeMonth(
        TimelineDate.stringToMonth(this.month.select.value)
      )
    );
    this.day.input.value = TimelineDate.magnetizeDay(
      this.day.input.value,
      TimelineDate.stringToMonth(this.month.select.value),
      this.year.input.value
    );
  }

  get value() {
    this._value.set(
      this.year.input.valueAsNumber,
      TimelineDate.stringToMonth(this.month.select.value),
      this.day.input.valueAsNumber
    );
    return this._value;
  }

  set value(content) {
    this._value.copy(content);
    this.day.input.value = this._value.day;
    this.month.select.value = TimelineDate.monthToString(this._value.month);
    this.year.input.value = this._value.year;
  }
}

window.customElements.define('timeline-date-selector', TimelineDateSelector);

export class TimelineUI extends HTMLElement {
  constructor() {
    super();

    // css
    this.classList.add('timeline-ui');

    /** @type {TimelineDateSelector} */
    this.minClampDateSelector = new TimelineDateSelector(
      'minClampDateSelector',
      'Minimum date',
      TimelineDate.MIN_TIMELINE_DATE
    );
    this.appendChild(this.minClampDateSelector);

    /** @type {TimelineDateSelector} */
    this.maxClampDateSelector = new TimelineDateSelector(
      'maxClampDateSelector',
      'Maximum date',
      TimelineDate.MAX_TIMELINE_DATE
    );
    this.appendChild(this.maxClampDateSelector);

    // listeners
    this.minClampDateSelector.addEventListener('change', () => {
      this.minClampDateSelector.magnetize();

      // clamp
      this.minClampDateSelector.value = this.minClampDateSelector.value.clamp(
        TimelineDate.MIN_TIMELINE_DATE,
        this.maxClampDateSelector.value.subDay()
      );
    });

    this.maxClampDateSelector.addEventListener('change', () => {
      this.maxClampDateSelector.magnetize();

      // clamp
      this.maxClampDateSelector.value = this.maxClampDateSelector.value.clamp(
        this.minClampDateSelector.value.add(1),
        TimelineDate.MAX_TIMELINE_DATE
      );
    });
  }
}

window.customElements.define('timeline-ui', TimelineUI);
